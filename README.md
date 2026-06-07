---
title: ClipStudio
emoji: 🎬
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
short_description: AI video clipper, auto-captions, and B-roll editor
---

# ClipStudio — editor + AI in one

Everything in one folder. The server hosts the editor **and** runs the AI, so you just add your API keys and start it.

What it does:
- **Auto-captions** in the spoken language (detected automatically).
- **Clip suggestions** — the best moments, one click to keep.
- **B-roll** — finds matching stock clips (and can generate them) and drops them on the timeline.
- Full **editor** — trim, split, caption, position B-roll, and **export** a finished `.webm`.

---

## 1. Install (one time)

Install **Node.js 18+** from https://nodejs.org first. Then:

```bash
cd clipstudio
npm install
cp .env.example .env
```

## 2. Add your keys

You only need **two keys — both free, no credit card:**

| Key | What it's for | Where to get it | Free? |
|-----|---------------|-----------------|-------|
| `GROQ_API_KEY` | Transcription **and** analysis | https://console.groq.com → Settings → API Keys | ✅ free tier, no card |
| `PEXELS_API_KEY` | Stock B-roll | https://www.pexels.com/api/ | ✅ free |

That's it — one Groq key powers both the Whisper transcription and the clip/B-roll analysis (using Llama 3.3 70B). `ffmpeg` is bundled, no separate install.

> **Don't have free Anthropic credit?** No problem — the default setup doesn't use Anthropic at all. The $5 Anthropic signup credit isn't guaranteed for every account/region, so this project runs analysis on Groq's free Llama model instead. If you'd rather use Claude for higher quality later, set `ANALYZE_PROVIDER=anthropic`, add `ANTHROPIC_API_KEY`, and set `ANALYZE_MODEL=claude-haiku-4-5-20251001`.
>
> **Why not OpenAI for transcription?** OpenAI stopped giving free credits in mid-2025 and its free tier excludes Whisper, so it needs billing. Groq runs the same Whisper model free (2,000 requests/day).

## 3. Start

```bash
npm start
```

Open the link it prints: **http://localhost:8787**

## 4. Use it

1. Drag a video in (or click to browse).
2. Click **AI Auto-process** → leave Backend URL blank → **Process video**.
3. Captions appear in the right language. A results box shows clip suggestions ("Keep this") and B-roll ("Add").
4. Trim/split as you like, tweak captions/B-roll, then **Export**.

> Tip: use **Chrome or Edge** — export (canvas → webm) is most reliable there.

---

## B-roll modes (`.env` → `BROLL_MODE`)

| Mode | Result | Cost |
|------|--------|------|
| `stock` | Real Pexels clips matching each cue | free / cheap |
| `generate` | New AI-generated clips | ~$0.05–$0.75 / sec |
| `both` | Stock first, generate as fallback | mixed |
| `off` | Skip B-roll | — |

`generate` is a **stub** until you wire a provider in `lib/broll.js` (kept off so nothing bills you by accident).

---

## Folder map

```
clipstudio/
├─ server.js          Express: serves editor + /api/process + /media
├─ public/index.html  the editor (the whole UI)
├─ lib/
│  ├─ transcribe.js   audio → text + language (Whisper)
│  ├─ analyze.js      transcript → clips + B-roll cues (Claude)
│  ├─ broll.js        finds/downloads B-roll  ← add generation here
│  └─ srt.js          builds the caption file
├─ .env.example       copy to .env and fill in keys
└─ package.json
```

## Notes & limits
- Whisper has a 25 MB audio cap; very long videos may need chunking (extend `lib/transcribe.js`).
- Export records a live playthrough, so keep the tab focused while it runs.
- For production: add a job queue for long videos, cloud storage (S3 / Cloudflare R2), and user accounts.

## If something errors
Copy the message from the terminal (or the popup) — the usual causes are a missing key in `.env` or the backend not running. Fix those first.