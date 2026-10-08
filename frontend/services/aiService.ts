// services/aiService.ts
// Minimal, focused service for "Full Response" generation (3 sentence options)

import Constants from 'expo-constants';

const API_KEY =
  process.env.EXPO_PUBLIC_GROQ_API_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GROQ_API_KEY ||
  '';

if (!API_KEY) {
  console.warn('Missing EXPO_PUBLIC_GROQ_API_KEY for aiService.ts');
}

const GROQ_BASE = 'https://api.groq.com/openai/v1/chat/completions';

// ---- Types ----
export type Speaker = 'A' | 'B';

export interface Turn {
  speaker: Speaker;
  text: string;
  ts?: number; // optional timestamp if you want it
}

export interface FullResponseInput {
  turns: Turn[];          // entire structured conversation
  maxContextChars?: number; // default trims to keep prompt small
  style?: 'neutral' | 'friendly' | 'concise';
  imageUrl?: string; // optional image to use as additional context
}

export interface WordGridInput {
  turns: Turn[];         // same context format as FullResponseInput
  prefix?: string;       // current partial sentence the user has composed (A's output)
  maxContextChars?: number;
  imageUrl?: string;
}

function clamp(str: string, max = 1800) {
  if (!str) return '';
  return str.length > max ? str.slice(-max) : str;
}

function serializeContext(turns: Turn[], maxChars = 1800): string {
  // Represent context as labeled lines, newest last
  const lines = turns.map(t => `(${t.speaker}) ${t.text.trim()}`).join('\n');
  return clamp(lines, maxChars);
}

function lastBTurn(turns: Turn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].speaker === 'B') return turns[i].text.trim();
  }
  return '';
}

function parsePipeList(s: string): string[] {
  // Expect: "sent1 | sent2 | sent3"
  return s
    .split('|')
    .map(x => x.trim())
    .filter(x => x.length > 0)
    .slice(0, 3);
}

function parsePipeWords(s: string, max = 8): string[] {
  // model should return words pipe-separated. Accept commas or newlines as fallback.
  if (!s) return [];
  // normalize some separators to pipe
  const normalized = s.replace(/\n+/g, '|').replace(/,/g, '|').replace(/\s*\|\s*/g, '|');
  const parts = normalized.split('|').map(p => p.trim()).filter(Boolean);
  // filter out anything that looks like punctuation-only or multi-word tokens
  const words = parts
    .map(w => w.replace(/^\W+|\W+$/g, '')) // trim non-word chars from ends
    .filter(w => !!w && !/^[\W_]+$/.test(w) && w.length <= 30)
    .slice(0, max);
  return words;
}

// ---- Model Call ----
async function groqChat(messages: any[], maxTokens = 128): Promise<string> {
  if (!API_KEY) return '';
  const resp = await fetch(GROQ_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant', // fast; you can race a bigger one if desired
      messages,
      temperature: 0.4,   // keep answers stable & practical
      top_p: 0.9,
      max_tokens: maxTokens,
      frequency_penalty: 0.3,
      presence_penalty: 0.0,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Groq error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// ---- Public: generate 3 full responses for A ----
export async function generateFullResponses(input: FullResponseInput): Promise<string[]> {
  const style = input.style || 'neutral';
  const ctx = serializeContext(input.turns, input.maxContextChars ?? 1800);
  const latestB = lastBTurn(input.turns);

  // Safety: if no recent B, still respond using context
  const latestTarget = latestB || '';

  const system = {
    role: 'system',
    content:
      "You help a user (A) communicate in short, natural sentences. " +
      "Read the conversation context and propose THREE distinct, helpful responses A could say next. " +
      "Return ONLY three responses, pipe-separated: sentence1 | sentence2 | sentence3. " +
      "Keep each under 12 words, polite, concrete, and directly responding to B's latest message. " +
      "No preambles, no labels, no quotes.",
  };

  const user = {
    role: 'user',
    content:
      `Style: ${style}\n\n` +
      `Conversation (oldest to newest):\n${ctx}\n\n` +
      (latestTarget
        ? `Respond specifically to B's latest message:\n"${latestTarget}"\n\n`
        : `No latest B found; respond based on the conversation context above.\n\n`) +
      (input.imageUrl ? `Also consider the image at this URL as additional context: ${input.imageUrl}\n\n` : '') +
      "Return exactly three short sentences, pipe-separated.",
  };

  const raw = await groqChat([system, user], 160);
  const candidates = parsePipeList(raw);

  // Fallback if the model misbehaves
  if (candidates.length < 3) {
    const defaults = [
      "Could you clarify that point?",
      "That makes sense. Here’s my concern.",
      "Thanks for explaining. May I add something?",
    ];
    return defaults.slice(0, 3);
  }

  return candidates;
}

// ---- Public: generate 8 next-word candidates for the word-grid ----
export async function generateWordGrid(input: WordGridInput): Promise<string[]> {
  const ctx = serializeContext(input.turns, input.maxContextChars ?? 1800);
  const prefix = (input.prefix || '').trim();

  // System prompt: be explicit about the exact output format and constraints
  const system = {
    role: 'system',
    content:
      "You are given a conversation context and a current partial sentence (prefix). " +
      "Return EXACTLY eight single-word TOKENS that could each plausibly follow the given prefix when forming a natural English sentence, and that are coherent with the conversation context. " +
      "Do NOT return punctuation or multi-word phrases. Do NOT include numbers, labels, or any explanation. " +
      "Output the eight words as a single pipe-separated list, e.g. word1 | word2 | word3 | ... | word8. " +
      "If fewer than eight sensible words exist, fill remaining slots with common function words like 'and' or 'the'.",
  };

  const user = {
    role: 'user',
    content:
      `Conversation (oldest to newest):\n${ctx}\n\n` +
      `Current prefix: "${prefix}"\n\n` +
      (input.imageUrl ? `Also consider the image at this URL as additional context: ${input.imageUrl}\n\n` : '') +
      'Return EXACTLY eight single words, pipe-separated.',
  };

  try {
    const raw = await groqChat([system, user], 96);
    const words = parsePipeWords(raw, 8);
    // If model returned fewer than 8 words, pad with heuristics
    if (words.length < 8) {
      const FALLBACK = ['and','to','the','is','it','in','for','with'];
      const padded = [...words, ...FALLBACK].slice(0, 8);
      return padded;
    }
    return words;
  } catch (err) {
    // On any error, return safe heuristics
    const FALLBACK = ['and','to','the','is','it','in','for','with'];
    return FALLBACK;
  }
}
