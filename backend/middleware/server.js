// server.js (middleware)
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { fetch } = require('undici');

dotenv.config();

const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const PORT = process.env.PORT || 3001;

if (!ELEVEN_API_KEY) console.error('Missing ELEVENLABS_API_KEY in .env');
if (!DEEPGRAM_API_KEY) console.warn('Missing DEEPGRAM_API_KEY in .env (only needed for /realtime)');

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

// ----- TTS proxy -----
app.post('/tts', async (req, res) => {
  try {
    const { text, voice } = req.body || {};
    if (!text?.trim()) return res.status(400).send('Missing text');

    const voiceId = voice || 'pNInz6obpgDQGcFmaJgB'; // replace with your actual voice_id
    const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const elevenResp = await fetch(elevenUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVEN_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        output_format: 'mp3_22050_32',
        voice_settings: {
          stability: 0.0,
          similarity_boost: 1.0,
          style: 0.0,
          use_speaker_boost: true,
          // remove "speed" if you ever get a 400; not all models accept it
        },
      }),
    });

    if (!elevenResp.ok) {
      const txt = await elevenResp.text().catch(() => '');
      console.error('[ElevenLabs error]', elevenResp.status, txt);
      return res.status(502).send(txt || 'Upstream error');
    }

    res.set('Content-Type', elevenResp.headers.get('content-type') || 'audio/mpeg');
    res.set('Cache-Control', 'no-store');

    const { Readable } = require('stream');
    Readable.fromWeb(elevenResp.body).pipe(res);
  } catch (err) {
    console.error('tts proxy error', err);
    res.status(500).send(String(err));
  }
});

// ----- HTTP server + Deepgram WS relay -----
const http = require('http');
const server = http.createServer(app);

const { attachDeepgramRealtime } = require('./realtime');
if (DEEPGRAM_API_KEY) {
  attachDeepgramRealtime(server, DEEPGRAM_API_KEY);
}

// IMPORTANT: listen with the HTTP server (NOT app.listen)
server.listen(PORT, () => {
  console.log(`HTTP + WS listening on http://0.0.0.0:${PORT}`);
});
