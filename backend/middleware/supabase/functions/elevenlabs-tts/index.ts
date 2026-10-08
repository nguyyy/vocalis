// Supabase Edge Function (Deno) - elevenlabs-tts
// Receives POST { text, voice? } and proxies to ElevenLabs TTS.

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const body = await req.json().catch(() => ({}));
    const text: string = body?.text || '';
    const voice: string = body?.voice || 'alloy'; 

    if (!text || !text.trim()) return new Response('Missing text', { status: 400 });


  const ELEVEN_API_KEY = (globalThis as any).Deno?.env?.get?.('ELEVENLABS_API_KEY');
    if (!ELEVEN_API_KEY) return new Response('Server misconfigured: missing ELEVENLABS_API_KEY', { status: 500 });


    const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;

    const elevenResp = await fetch(elevenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVEN_API_KEY,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text }),
    });

    if (!elevenResp.ok) {
      const errText = await elevenResp.text().catch(() => 'Unknown error from ElevenLabs');
      return new Response(errText, { status: 502 });
    }

    const contentType = elevenResp.headers.get('content-type') || 'audio/mpeg';
    const buf = await elevenResp.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.error('elevenlabs-tts error', err);
    return new Response(String((err as any)?.message || String(err)), { status: 500 });
  }
};
