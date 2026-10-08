import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  FlatList,
  Platform,
  Keyboard,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { generateFullResponses, generateWordGrid } from '../services/aiService';



const { width } = Dimensions.get('window');
const MAX_CONTENT_WIDTH = 420; // constrain layout for readability on large screens
const CONTAINER_PADDING = 24;
const effectiveWidth = Math.min(width, MAX_CONTENT_WIDTH);
const BOX_SIZE = Math.floor((effectiveWidth - CONTAINER_PADDING) / 3);

type Mode = 'typing' | 'word' | 'sentence';

const MOCK_SUGGESTIONS = ['hello', 'world', 'need', 'help', 'please', 'thanks', 'yes', 'no', 'stop', 'go'];
const MOCK_WORD_GRID = [
  'I', 'want', 'to', 'go',
  'eat', 'sleep', 'play', 'help',
  'more', 'less', 'please', 'thanks'
];
const MOCK_SENTENCES = [
  'How are you?',
  'I need help.',
  'Can we go now?',
  'Thank you so much.'
];

export default function UpdatedSearch() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 12000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 12000, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const translate = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
  const [mode, setMode] = useState<Mode>('typing');
  const [outputText, setOutputText] = useState('');
  const [typingValue, setTypingValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>(MOCK_SUGGESTIONS);
  const [gridWords, setGridWords] = useState<string[]>(MOCK_WORD_GRID.slice(0, 8));
  const [sentences, setSentences] = useState<string[]>(MOCK_SENTENCES);
  const [gridLoading, setGridLoading] = useState(false);
  // Transcription UI is always visible; the mic button controls whether streaming is active.
  const [ttsLoading, setTtsLoading] = useState(false);
  const outputScrollRef = useRef<ScrollView | null>(null);
  const [transcriptContent, setTranscriptContent] = useState<string>('');
  const transcriptScrollRef = useRef<ScrollView | null>(null);
  const [recordingOn, setRecordingOn] = useState(false);
  const [turns, setTurns] = useState<{ speaker: 'A' | 'B'; text: string; ts?: number; ended?: boolean }[]>([]);
  const params = useLocalSearchParams<{ uploadedUrl?: string }>();
  const lastHandledUpload = useRef<string | null>(null);

  useEffect(() => {
    const url = typeof params.uploadedUrl === 'string' ? params.uploadedUrl : undefined;
    if (url && lastHandledUpload.current !== url) {
      // Optionally append the uploaded URL to the output so user can see it
      setOutputText((prev) => (prev ? `${prev.trim()} ${url}` : url));
      lastHandledUpload.current = url;
      // Trigger generation using the image as additional context
      void (async () => {
        try {
          await fetchResponsesForTurns(turns, url);
        } catch (e) {
          console.warn('Image-driven generation failed', e);
        }
      })();
    }
  }, [params.uploadedUrl]);


  // --- Realtime STT state/refs ---
const [finalText, setFinalText] = useState('');     // committed words (state for UI)
const [interimText, setInterimText] = useState(''); // live partial (state for UI)

// 🔁 always-current mirrors used by timers/timeouts
const finalTextRef   = useRef('');   // mirror of finalText
const interimTextRef = useRef('');   // mirror of interimText

const wsRef = useRef<WebSocket | null>(null);
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const streamRef = useRef<MediaStream | null>(null);
const isStreamingRef = useRef(false);
const lastFinalRef = useRef('');

// guards to prevent duplicates / races
const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const refreshInFlightRef = useRef(false);
const heardSinceLastCommitRef = useRef(false);
const lastCommittedRef = useRef<string>(''); // last B text we committed
const INACTIVITY_MS = 1500;

// (optional) live turns ref if you ever need it in timeouts
const turnsRef = useRef<typeof turns>([]);
useEffect(() => { turnsRef.current = turns; }, [turns]);

  function addATurnIfNotDuplicate(text: string) {
    const t = text.trim();
    if (!t) return;
    const last = turnsRef.current[turnsRef.current.length - 1];
    if (last && last.speaker === 'A' && (last.text || '').trim() === t) {
      // duplicate of last A-turn, skip
      return;
    }
    setTurns(prev => [...prev, { speaker: 'A', text: t, ts: Date.now(), ended: true }]);
  }

  function clearTranscript() {
    // Reset all conversation buffers and turns so the user can start fresh
    setTurns([]);
    setTranscriptContent('');
    lastCommittedRef.current = '';
    lastFinalRef.current = '';
    setFinalText(''); finalTextRef.current = '';
    setInterimText(''); interimTextRef.current = '';
  }


  // Use localhost for Expo Web on same machine; use LAN IP on device
  const REALTIME_WS_URL = (() => {
    if (Platform.OS !== 'web') {
      // for device/simulator testing, use your LAN IP
      return 'ws://192.168.1.23:3001/realtime'; // <= change to your machine's LAN IP
    }
    // Web: derive from current page
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
    const scheme = isHttps ? 'wss' : 'ws';
    return `${scheme}://${host}:3001/realtime`;
  })();
  // Mode toggle handler: preserve outputText but clear transient suggestions
  function changeMode(m: Mode) {
    setMode(m);
    // simple mock: reset suggestions when switching
    setSuggestions(MOCK_SUGGESTIONS);
  }

  function appendToOutput(word: string) {
    setOutputText((prev) => {
      if (!prev) return word;
      // if the selected tile is punctuation, append without a preceding space
      if (['!', '?', '.', ','].includes(word)) return prev.trim() + word;
      return prev.trim() + ' ' + word;
    });
  }

  // Simple local next-word heuristics (no network). Keeps app compiling & responsive.
  function nextWordHeuristics(prefix: string): string[] {
    const FUNCTIONALS = ['and','to','of','that','is','it','in','for','on','with','as','but','or','if','so','then','when','because','can','will','would','should','have','has','had','do','does','did'];
    const AFTER_I = ['am','need','want','can','will','was','have','think','feel'];
    const AFTER_YOU = ['are','can','will','should','have','were','need','want'];
    const AFTER_DET = ['time','way','thing','person','place','idea','one'];

    const lastWord = (prefix.trim().match(/([A-Za-z']+)$/)?.[1] || '').toLowerCase();

    if (!prefix.trim() || /[.!?]"?$/.test(prefix.trimEnd())) {
      // new sentence: offer starters
      return ['I','Maybe','Please','Yes','No','Sorry','Thank','Could'];
    }
    if (lastWord === 'i') return AFTER_I.slice(0, 8);
    if (lastWord === 'you') return AFTER_YOU.slice(0, 8);

    if (/\b(the|a|an|this|that|these|those|my|your|his|her|our|their)$/.test(prefix.trim().toLowerCase())) {
      return AFTER_DET.slice(0, 8);
    }

    // fallback: function words first
    return FUNCTIONALS.slice(0, 8);
  }


  // When a grid word is pressed: append it, then request AI for the next 8 dynamic grid words
  async function handleGridWordPress(word: string) {
    appendToOutput(word);

    // punctuation: don't fetch new words
    if (['!', '?', '.', ','].includes(word)) return;

    if (gridLoading) return;
    setGridLoading(true);

    try {
      // Try the AI endpoint first (falls back to heuristics inside on error)
      const prefix = ((outputText || '').trim() + ' ' + (word || '')).trim();
      let dynamic: string[] = [];

      try {
        dynamic = await generateWordGrid({ turns, prefix, maxContextChars: 1200 });
      } catch (e) {
        console.warn('generateWordGrid failed, falling back', e);
        dynamic = [];
      }

      if (!dynamic || dynamic.length < 1) {
        const heur = nextWordHeuristics((outputText || '').trim());
        dynamic = heur.slice(0, 8);
      }

      const padded = [...dynamic, ...Array(Math.max(0, 8 - dynamic.length)).fill('')].slice(0, 8);
      setGridWords(padded);
    } catch (e) {
      console.warn('Grid update failed', e);
    } finally {
      setGridLoading(false);
    }
  }


  function replaceOutput(sentence: string) {
    setOutputText(sentence);
  }

  async function onSpeak() {
    // allow speaking either the composed outputText or the current typingValue
    const textToSpeak = (outputText || '').trim() || (typingValue || '').trim();
    if (!textToSpeak || ttsLoading) return;
    setTtsLoading(true);
    try {
      // NOTE: change this URL to your middleware URL in production
      // For a quick local hackathon setup we run a small Express proxy on port 3001
      const apiUrl = 'http://127.0.0.1:3001/tts';

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.warn('TTS error', resp.status, txt);
        return;
      }

      // Play on web using an object URL. For native (Expo) see notes below.
      const blob = await resp.blob();
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const audio = new window.Audio(url);
        await audio.play();
        // release after some time
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        // Append A's spoken text to transcript so Speech is visible regardless of current mode
        addATurnIfNotDuplicate(textToSpeak);
      } else {
        // On native (Expo) you'll want to add `expo-av` and `expo-file-system`.
        // The easiest approaches are:
        // 1) Have the middleware return a temporary public URL the app can stream.
        // 2) Or save the returned bytes to a local file (FileSystem) then load with Audio.Sound from expo-av.
        // We purposely avoid adding expo-av to this repo automatically; if you want, I can add
        // a native implementation that saves the blob and plays it with expo-av.
        console.warn('Received audio blob on native. Please install expo-av and save+play the blob (see README).');
        // For native flows where we don't actually play audio here, still append the spoken text
        addATurnIfNotDuplicate(textToSpeak);
      }

      // clear both output and typing fields after speaking
      setOutputText('');
      setTypingValue('');
    } catch (e) {
      console.error('onSpeak error', e);
    } finally {
      setTtsLoading(false);
    }
  }

  function onClear() {
    setOutputText('');
  }

  async function refreshFullResponses() {
    // Backwards-compatible wrapper that uses the current `turns` state.
    return fetchResponsesForTurns(turns);
  }

  // Fetch responses for a specific turns array (avoids relying on async setState)
  async function fetchResponsesForTurns(turnsForRequest: { speaker: 'A' | 'B'; text: string; ts?: number }[], imageUrl?: string) {
    try {
      const res = await generateFullResponses({
        turns: turnsForRequest,
        style: 'neutral',
        maxContextChars: 1800,
        imageUrl,
      });
      setSentences(res);
      // Also refresh the word grid predictions for the current context.
      try {
        const wg = await generateWordGrid({ turns: turnsForRequest, prefix: outputText || '', maxContextChars: 1200, imageUrl });
        if (wg && wg.length) setGridWords(wg.slice(0, 8));
      } catch (e) {
        // ignore grid failures; heuristics will cover interaction
      }
      return res;
    } catch (e) {
      console.warn('Full response generation failed', e);
      const fallback = [
        'Can you repeat that?',
        'That helps. Let me think.',
        'Thanks—could you clarify that?'
      ];
      setSentences(fallback);
      return fallback;
    }
  }


  // ----- DEEPGRAM REALTIME HANDLERS -----
  function clearInactivityTimer() {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }
  function resetInactivityTimer() {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(handleInactivity, INACTIVITY_MS);
  }

  async function handleInactivity() {
    clearInactivityTimer();

    if (!heardSinceLastCommitRef.current) return;

    const committedFinal  = (finalTextRef.current || '').trim();
    const committedInter  = (interimTextRef.current || '').trim();
    const committed       = `${committedFinal} ${committedInter}`.trim();
    if (!committed) return;

    if (committed === lastCommittedRef.current) {
      heardSinceLastCommitRef.current = false;
      return;
    }

    const newTurn = { speaker: 'B' as const, text: committed, ts: Date.now(), ended: true };
    // use functional update to avoid stale `turns`
    setTurns(prev => {
      const next = [...prev, newTurn];
      // refresh immediately using the *fresh* array
      if (!refreshInFlightRef.current) {
        refreshInFlightRef.current = true;
        void (async () => {
          try { await fetchResponsesForTurns(next); } finally { refreshInFlightRef.current = false; }
        })();
      }
      return next;
    });

    lastCommittedRef.current = committed;
    heardSinceLastCommitRef.current = false;

    lastFinalRef.current = '';
    setFinalText('');      finalTextRef.current = '';
    setInterimText('');    interimTextRef.current = '';
  }

  async function startTranscription() {
    if (Platform.OS !== 'web') {
      console.warn('Live streaming demo implemented for Web. For native, use RN WebRTC or chunk-upload fallback.');
      return;
    }

    // 🚫 If already streaming, do nothing
    if (isStreamingRef.current) {
      console.log('[STT] already streaming, skipping start');
      return;
    }

    const ws = new WebSocket(REALTIME_WS_URL);
    wsRef.current = ws;

    // Optional: ensure we always parse text
    ws.binaryType = 'blob';

    ws.onopen = async () => {
      isStreamingRef.current = true; // ✅ mark active
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 48000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;

        const mr = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : undefined,
        });
        mediaRecorderRef.current = mr;

        mr.ondataavailable = (ev) => {
          if (!ev.data?.size || ws.readyState !== WebSocket.OPEN) return;
          ev.data.arrayBuffer().then((buf) => ws.send(buf));
        };

        mr.start(250);
      } catch (err) {
        console.error('Mic error:', err);
        stopTranscription();
      }
    };

    ws.onmessage = async (e) => {
      try {
        let dataStr: string | null = null;
        if (typeof e.data === 'string') dataStr = e.data;
        else if (e.data instanceof Blob) dataStr = await e.data.text();
        else if (e.data instanceof ArrayBuffer) dataStr = new TextDecoder().decode(e.data);
        else return;

        const msg = JSON.parse(dataStr);

        // Only handle Results packets
        if (msg.type !== 'Results') return;

        const alt = msg?.channel?.alternatives?.[0];
        const text = alt?.transcript || '';
        if (!text) return;

        if (msg.is_final) {
            if (text.trim() === lastFinalRef.current.trim()) return;
            lastFinalRef.current = text;
            setFinalText(prev => {
              const next = prev + (text.endsWith(' ') ? text : text + ' ');
              finalTextRef.current = next;       // 🔁 mirror
              return next;
            });
            setInterimText(''); interimTextRef.current = ''; // 🔁 mirror
            heardSinceLastCommitRef.current = true;
            resetInactivityTimer();
          } else {
            setInterimText(text);
            interimTextRef.current = text;       // 🔁 mirror
            heardSinceLastCommitRef.current = true;
            resetInactivityTimer();
          }

      } catch {}
    };

    ws.onerror = (e) => console.warn('Realtime WS error', e);
    ws.onclose = () => {
      // ensure everything is cleaned up
      try { if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop(); } catch {}
      mediaRecorderRef.current = null;

      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
      streamRef.current = null;

      wsRef.current = null;
      isStreamingRef.current = false; // ✅ mark inactive
      // clear inactivity timer if present
      clearInactivityTimer();
    };
  }

  function stopTranscription() {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    mediaRecorderRef.current = null;

    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;

    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;

    isStreamingRef.current = false;
    clearInactivityTimer();

    const committed = `${finalText || ''} ${interimText || ''}`.trim();
    if (committed && committed !== lastCommittedRef.current) {
      const newTurn = { speaker: 'B' as const, text: committed, ts: Date.now(), ended: true };
      const newTurns = [...turns, newTurn];
      setTurns(newTurns);
      lastCommittedRef.current = committed;
      lastFinalRef.current = '';
      setFinalText('');      finalTextRef.current = '';
      setInterimText('');    interimTextRef.current = '';
      void fetchResponsesForTurns(newTurns);
    } else {
      // even if nothing to commit, reset buffers
      lastFinalRef.current = '';
      setFinalText('');      finalTextRef.current = '';
      setInterimText('');    interimTextRef.current = '';
    }
  }



  useEffect(() => {
    if (transcriptScrollRef.current) {
      try {
        transcriptScrollRef.current.scrollToEnd({ animated: true });
      } catch (e) {
        // ignore
      }
    }
  }, [transcriptContent]);

  // Start/stop Deepgram when toggles change
  useEffect(() => {
    setTranscriptContent((finalText + interimText).trim());
  }, [finalText, interimText]);

  useEffect(() => {
    // Start/stop based solely on whether recording is active. The transcription UI
    // is always visible; recordingOn controls whether audio is streamed.
    if (recordingOn) startTranscription();
    else stopTranscription();
    return () => stopTranscription();
  }, [recordingOn]);

  useEffect(() => {
    if (!recordingOn) return;
    // any change means “activity”; when it stops changing for 1500ms, we’ll fire
    heardSinceLastCommitRef.current = true;
    resetInactivityTimer();
  }, [finalText, interimText, recordingOn]);


  // Build the transcript display: previous turns + any live (in-progress) B text
  const liveText = `${(finalText || '').trim()} ${(interimText || '').trim()}`.trim();
  const displayLines = [...turns.map(t => `(${t.speaker}) ${t.text}${(t.speaker === 'B' && t.ended) ? ' [END]' : ''}`)];
  if (liveText) displayLines.push(`(B) ${liveText}`);
  const displayTranscript = (displayLines.filter(Boolean).join('\n')) || 'Transcript will appear here...';


  return (
    <View style={styles.screen}>
      {/* Animated background */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { zIndex: 0, transform: [{ translateX: translate }] }] as any}
      >
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(44, 44, 44, 0.15)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.14)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.1)' }} />
          <View style={{ flex: 1, backgroundColor: 'rgba(38, 38, 38, 0.06)' }} />
        </View>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* AppHeader */}
      <View style={[styles.header, { zIndex: 1 }]}>
        <Text style={styles.title}>Vocalis</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.settingsBtn}
          onPress={() => router.push('/userContext')}
        >
          <Text style={styles.settingsText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* ModeToggleBar */}
      <View style={[styles.modeToggleRow, styles.centeredContent]}>
        <ModeButton label="Typing" active={mode === 'typing'} onPress={() => changeMode('typing')} />
        <ModeButton label="Word Grid" active={mode === 'word'} onPress={() => changeMode('word')} />
        <ModeButton label="Full Response" active={mode === 'sentence'} onPress={() => changeMode('sentence')} />
      </View>

      {/* OutputBar */}
      <View style={[styles.outputBarContainer, styles.centeredContent]}>
        <View style={styles.outputInner}>
          <TextInput
            value={outputText}
            onChangeText={setOutputText}
            placeholder="Compose your message"
            placeholderTextColor="#999"
            style={[styles.outputTextContainer, styles.outputTextInput]}
            multiline
            accessibilityLabel="Output editable input"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.outputActions}>
            <TouchableOpacity onPress={onClear} style={styles.iconButton} accessibilityLabel="Clear">
              <Text style={styles.iconText}>🗑️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSpeak}
              style={[styles.speakPrimary, !outputText.trim() && styles.disabled]}
              accessibilityLabel="Speak"
              disabled={!outputText.trim()}
            >
              <Text style={styles.speakText}>🔊 Speak</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Dynamic Area */}
      <View style={[styles.dynamicArea, styles.centeredContent]}>
        <View style={styles.contentMaxWidth}>
          {/* Always show the main transcript area. Shrink when in Word Grid mode so the grid fits. */}
          <View style={[styles.transcriptBox, mode === 'word' ? styles.transcriptBoxSmall : {}, { position: 'relative' }]}> 
            <ScrollView
              ref={transcriptScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.transcriptText}>{displayTranscript}</Text>
            </ScrollView>
            <TouchableOpacity
              onPress={clearTranscript}
              style={styles.transcriptClearBtn}
              accessibilityLabel="Clear transcript"
            >
              <Text style={styles.iconText}>🗑️</Text>
            </TouchableOpacity>
          </View>

          {/* Typing mode now uses the main output box above — no inline suggestions or separate typing box */}

          {mode === 'word' && (
            <WordGridMode
              words={gridWords}
              onPressWord={(w) => handleGridWordPress(w)}
              transcriptContent={displayTranscript}
              onClearTranscript={clearTranscript}
            />
          )}

          {mode === 'sentence' && (
            <SentenceMode
              sentences={sentences}
              onSelect={(s) => {
                // When a suggested full response is selected, only populate the output text.
                // Do NOT append an A-turn to the transcript here — finalize/commit when
                // the user presses Speak. onSpeak already calls addATurnIfNotDuplicate.
                clearInactivityTimer(); // cancel pending B timer
                appendToOutput(s);
              }}
            />
          )}


        </View>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomRow}>
        {/* Transcription UI is always visible; the mic button controls recordingOn. */}

        <TouchableOpacity
          onPress={() => setRecordingOn((r) => !r)}
          style={[styles.recordButton, recordingOn && styles.recordingActive]}
          accessibilityLabel={recordingOn ? 'Stop Recording' : 'Start Recording'}
        >
          {recordingOn ? (
            <View style={styles.stopSquare} />
          ) : (
            <Text style={styles.fabText}>🎤</Text>
          )}
        </TouchableOpacity>
        {mode !== 'typing' && (
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={() => router.push('/camera-capture')}
            accessibilityLabel="Open camera"
          >
            <Text style={styles.fabText}>📷</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.modeBtn, active && styles.modeBtnActive]} accessibilityRole="button">
      <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TypingMode({ value, onChange, suggestions, onSelectSuggestion }: { value: string; onChange: (v: string) => void; suggestions: string[]; onSelectSuggestion: (s: string) => void }) {
  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Type here..."
        placeholderTextColor="#ccc"
        style={styles.textInput}
        accessibilityLabel="Typing input"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        editable={true}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.predictiveRow} keyboardShouldPersistTaps="handled">
        {suggestions.slice(0,5).map(s => (
          <TouchableOpacity key={s} onPress={() => onSelectSuggestion(s)} style={styles.chip} accessibilityRole="button">
            <Text style={styles.chipText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function WordGridMode({ words, onPressWord, transcriptContent, onClearTranscript }: { words: string[]; onPressWord: (w: string) => void; transcriptContent?: string; onClearTranscript?: () => void }) {
  // We always want 12 tiles. Last 4 are fixed punctuation, first 8 are dynamic
  const FIXED_PUNCT = ['!', '?', '.', ','];
  const dynamic = words.slice(0, 8);
  // pad dynamic to length 8 with empty placeholders if needed
  const paddedDynamic = [...dynamic, ...Array(Math.max(0, 8 - dynamic.length)).fill('')];
  const items = [...paddedDynamic.slice(0, 8), ...FIXED_PUNCT]; // total 12

  // render rows of 3
  const rows: string[][] = [];
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));

  // Calculate dynamic height while keeping width constant
  const currentHeight = BOX_SIZE;
  // Shrink all rows by 2 pixels as requested, clamp to minimum of 1
  const adjustedHeight = Math.max(1, currentHeight - 2);

  const gridItemStyle = {
    width: BOX_SIZE, // Keep width constant
    height: adjustedHeight, // Only height changes with switch (minus 2px)
    marginHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#18181b',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 48
  };

  const transcriptScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (transcriptScrollRef.current) {
      try {
        transcriptScrollRef.current.scrollToEnd({ animated: true });
      } catch (e) {
        // ignore
      }
    }
  }, [transcriptContent]);

  return (
    <View style={[styles.gridContainer, { justifyContent: 'flex-end' }]}>

      <View style={{ marginBottom: 18 }}> {/* space below grid */}
        {rows.map((row, ri) => (
          <View key={ri} style={styles.gridRow}>
            {row.map((w, ci) => (
              w === '' ? (
                <View key={ci} style={[gridItemStyle, { backgroundColor: 'transparent' }]} />
              ) : (
                <TouchableOpacity 
                  key={ci} 
                  onPress={() => onPressWord(w)} 
                  style={gridItemStyle} 
                  accessibilityRole="button"
                >
                  <Text style={styles.gridItemText}>{w}</Text>
                </TouchableOpacity>
              )
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function SentenceMode({ sentences, onSelect }: { sentences: string[]; onSelect: (s: string) => void }) {
  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      {sentences.map((s, i) => (
        <TouchableOpacity key={i} onPress={() => onSelect(s)} style={styles.sentenceCard} accessibilityRole="button">
          <Text style={styles.sentenceText}>{s}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* Utilities */
function shuffleArray<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'ios' ? 48 : 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 8 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  settingsBtn: { position: 'absolute', right: 16, top: 6, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontSize: 20 },
  modeToggleRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, marginVertical: 8 },
  modeBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, minWidth: 96, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#2d0b4e' },
  modeBtnText: { color: '#fff', fontSize: 14 },
  modeBtnTextActive: { fontWeight: '700' },
  outputBarContainer: { backgroundColor: '#18181b', marginHorizontal: 12, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  outputText: { color: '#fff', fontSize: 16, marginRight: 8, lineHeight: 20 },
  outputActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: 8, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },
  // make primary controls more opaque and a bit brighter/lighter
  speakPrimary: { backgroundColor: '#e7c6f8', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginLeft: 8, opacity: 1 },
  speakText: { color: '#000', fontWeight: '700' },
  // make disabled controls fully opaque per request
  disabled: { opacity: 1 },
  dynamicArea: { flex: 1, padding: 12, alignItems: 'center' },
  textInput: { width: '100%', backgroundColor: '#18181b', color: '#fff', borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 8 },
  predictiveRow: { paddingVertical: 8 },
  chip: { backgroundColor: '#2d0b4e', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, marginHorizontal: 6, minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  chipText: { color: '#fff', fontWeight: '600' },
  gridContainer: { 
    width: '100%', 
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end'
  },
  contentMaxWidth: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  centeredContent: { alignItems: 'center', alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  outputInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  outputTextContainer: { maxHeight: 160, minHeight: 60, width: '65%' },
  gridRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  gridItem: { width: BOX_SIZE, aspectRatio: 1, marginHorizontal: 6, borderRadius: 12, backgroundColor: '#18181b', alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  gridItemText: { color: '#fff', fontWeight: '700' },
  refreshBtn: { alignSelf: 'flex-end', marginRight: 24, marginBottom: 8, padding: 8 },
  refreshText: { color: '#b18cd1' },
  sentenceCard: { width: '90%', backgroundColor: '#18181b', padding: 16, borderRadius: 12, marginBottom: 12, minHeight: 88, justifyContent: 'center' },
  sentenceText: { color: '#fff', fontSize: 18 },
  // Bottom row: center primary action buttons (mic + camera)
  bottomRow: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  recordButton: { 
    backgroundColor: '#e7c6f8', 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginHorizontal: 12,
    opacity: 1,
  },
  recordingActive: { backgroundColor: '#ff5c5c' },
  stopSquare: { width: 18, height: 18, backgroundColor: '#000', borderRadius: 2 },
  fabText: { fontSize: 24 },
 
  switchContainer: {
    marginRight: 24,
    transform: [{ scale: 1.5 }], 
  },

  cameraButton: {
    backgroundColor: '#e7c6f8',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
    opacity: 1,
  },
  transcriptBox: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    width: Math.min(MAX_CONTENT_WIDTH + 10, effectiveWidth),
    alignSelf: 'center',
    // Larger transcript area so more conversation is visible
    height: Math.max(BOX_SIZE * 1.6, 220),
    minHeight: Math.max(BOX_SIZE * 1.6, 220)
  },
  transcriptBoxSmall: {
    height: BOX_SIZE - 25,
    minHeight: BOX_SIZE - 25,
  },
  transcriptClearBtn: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'transparent',
    padding: 6,
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  transcriptText: {
    color: '#fff',
    fontSize: 17,
    textAlignVertical: 'top',
  },
  outputTextInput: {
    color: '#fff',
    fontSize: 16,
    paddingVertical: 6,
    paddingRight: 8,
    paddingLeft: 4,
    backgroundColor: 'transparent',
  },
  
});