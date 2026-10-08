# vocalis

an aac app for people who can't (or don't choose to) talk out loud.

the other person speaks, deepgram transcribes it live, and a small llm suggests what you might say back. pick a full reply, build one from a word grid, or just type. hit speak and elevenlabs reads it out. you can also snap a photo so suggestions have some context.

## stack

- frontend: expo / react native (`frontend/`)
- middleware: express + ws (`backend/middleware/`)
  - `POST /tts` proxies elevenlabs
  - `/realtime` relays mic audio to deepgram
- suggestions: groq, llama-3.1-8b-instant

## run

```
cd backend/middleware
npm i
npm start
```

needs `ELEVENLABS_API_KEY` and `DEEPGRAM_API_KEY` in `backend/middleware/.env`.

```
cd frontend
npm i
npx expo start
```

needs `EXPO_PUBLIC_GROQ_API_KEY` in `frontend/.env`.

on a phone, change the lan ip in `frontend/app/updatedSearch.tsx` to your machine's.

# attribution
created by  Seth Chang, Dylan Nguyen, & Christopher Tran.