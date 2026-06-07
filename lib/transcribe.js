// Transcription: extract audio, then send to a Whisper provider that auto-detects
// the language. We request WORD-level timestamps and group words into short
// caption chunks (TikTok-style) so captions don't appear as long merged blocks.

import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";

const PROVIDERS = {
  groq:   { url: "https://api.groq.com/openai/v1/audio/transcriptions",
            model: "whisper-large-v3", keyEnv: "GROQ_API_KEY" },
  openai: { url: "https://api.openai.com/v1/audio/transcriptions",
            model: "whisper-1", keyEnv: "OPENAI_API_KEY" },
};

// Tune these to taste:
const CHUNK = {
  maxWords: 4,   // max words per caption block
  maxDur:   2.0, // max seconds per caption block
  pause:    0.4, // a silence gap >= this forces a new caption
};

function extractAudio(videoPath, outPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y","-i",videoPath,"-vn","-ac","1","-ar","16000","-b:a","64k",outPath];
    const proc = spawn(ffmpegPath, args);
    let err = "";
    proc.stderr.on("data", d => err += d.toString());
    proc.on("close", c => c === 0 ? resolve(outPath) : reject(new Error("ffmpeg failed:\n"+err)));
    proc.on("error", reject);
  });
}

// Group word-level timestamps into short caption chunks.
function chunkWords(words) {
  const out = [];
  let cur = null;
  for (const w of words) {
    const word = (w.word || "").trim();
    if (!word) continue;
    if (!cur) { cur = { start: w.start, end: w.end, text: word }; continue; }
    const gap = w.start - cur.end;
    const wouldDur = w.end - cur.start;
    const wordCount = cur.text.split(/\s+/).length;
    const endsSentence = /[.!?]$/.test(cur.text);
    const breakHere = endsSentence || gap > CHUNK.pause
                   || wordCount >= CHUNK.maxWords || wouldDur > CHUNK.maxDur;
    if (breakHere) {
      out.push(cur);
      cur = { start: w.start, end: w.end, text: word };
    } else {
      cur.end = w.end;
      cur.text += " " + word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function callWhisper(cfg, audioPath) {
  const key = process.env[cfg.keyEnv];
  if (!key) throw new Error(`${cfg.keyEnv} is missing in .env`);

  const buf = await readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", cfg.model);
  form.append("response_format", "verbose_json");
  // Ask for both word- and segment-level timestamps. We prefer words.
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");

  const res = await fetch(cfg.url, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const wordsArr = data.words || [];
  const segments = wordsArr.length
    ? chunkWords(wordsArr)
    : (data.segments || []).map(s => ({ start: s.start, end: s.end, text: s.text }));

  return { language: data.language || "unknown", text: data.text || "", segments };
}

export async function transcribe(videoPath) {
  const provider = (process.env.TRANSCRIBE_PROVIDER || "groq").toLowerCase();
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown TRANSCRIBE_PROVIDER "${provider}" (use "groq" or "openai").`);

  const audioPath = videoPath + ".mp3";
  await extractAudio(videoPath, audioPath);
  try {
    return await callWhisper(cfg, audioPath);
  } finally {
    await unlink(audioPath).catch(() => {});
  }
}