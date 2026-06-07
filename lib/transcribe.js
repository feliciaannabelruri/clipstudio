// Transcription: extract audio from the uploaded video, then send it to a
// speech-to-text provider that auto-detects the language and returns timestamps.
//
// Two providers, both Whisper, both OpenAI-compatible:
//   groq    -> FREE tier, no credit card (recommended to start)
//   openai  -> needs billing enabled

import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";

const PROVIDERS = {
  groq: {
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    model: "whisper-large-v3",
    keyEnv: "GROQ_API_KEY",
  },
  openai: {
    url: "https://api.openai.com/v1/audio/transcriptions",
    model: "whisper-1",
    keyEnv: "OPENAI_API_KEY",
  },
};

// Extract mono 16kHz mp3 audio from a video file (small + STT-friendly).
function extractAudio(videoPath, outPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", outPath];
    const proc = spawn(ffmpegPath, args);
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => (code === 0 ? resolve(outPath) : reject(new Error("ffmpeg failed:\n" + err))));
    proc.on("error", reject);
  });
}

// Whisper via an OpenAI-compatible endpoint. Omitting "language" lets it auto-detect.
async function callWhisper(cfg, audioPath) {
  const key = process.env[cfg.keyEnv];
  if (!key) throw new Error(`${cfg.keyEnv} is missing in .env`);

  const buf = await readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", cfg.model);
  form.append("response_format", "verbose_json");

  const res = await fetch(cfg.url, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const segments = (data.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text }));
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
