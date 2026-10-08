elevenlabs-tts (Supabase Edge Function)
=====================================

Purpose
-------
This edge function proxies text-to-speech requests to ElevenLabs and returns audio bytes to the caller.

How to configure
-----------------
- Set your ElevenLabs API key as a secret when running locally or in your deployment environment.
  - Locally with the Supabase CLI: `supabase secrets set ELEVENLABS_API_KEY="<your-key>"`
  - In production: set the environment variable `ELEVENLABS_API_KEY` for the Edge Function.

Local run (dev)
---------------
1. From `backend/middleware/supabase` run the Supabase CLI dev server:

   supabase start

2. Serve the function (in the supabase functions environment):

   supabase functions serve elevenlabs-tts

The function will be available at:

  http://127.0.0.1:54321/functions/v1/elevenlabs-tts

Request shape
-------------
POST JSON body:

  { "text": "Hello world", "voice": "voiceIdOptional" }

Response
--------
Binary audio bytes are returned with the Content-Type set according to ElevenLabs response (usually `audio/mpeg`).
