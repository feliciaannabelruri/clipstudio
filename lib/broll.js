// B-roll sourcing. Takes cues from analyze() and attaches a real media URL.
// Stock clips are downloaded into ./media and served same-origin by the server,
// so the editor can preview AND export them (remote files would taint the canvas).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const MEDIA_DIR = "media";

async function download(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, name), buf);
  return `/media/${name}`; // same-origin path served by the server
}

// --- Stock: Pexels video search (free API key) ---
async function fromStock(query, idx) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY is missing in .env");

  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels failed (${res.status})`);

  const data = await res.json();
  const video = data.videos && data.videos[0];
  if (!video) return null;

  const file =
    (video.video_files || []).find((f) => f.height && f.height <= 1080) ||
    (video.video_files || [])[0];
  if (!file) return null;

  const localPath = await download(file.link, `broll_${Date.now()}_${idx}.mp4`);
  return { source: "stock", kind: "video", url: localPath, thumb: video.image, credit: video.user && video.user.name };
}

// --- Generate: AI text-to-video (PLUG-IN POINT) ---
// Wire your provider here (fal.ai, Replicate, Kling, Sora, Veo, ...).
// Left as a stub so it never silently bills you.
async function fromGenerate(query) {
  const key = process.env.VIDEOGEN_API_KEY;
  if (!key) throw new Error("VIDEOGEN_API_KEY is missing in .env");
  // TODO: POST prompt -> poll job -> download result -> return { source:"generate", kind:"video", url:"/media/..." }
  return { source: "generate", url: null, note: `STUB: would generate "${query}". Add your provider in lib/broll.js.` };
}

export async function sourceBroll(cues) {
  const mode = (process.env.BROLL_MODE || "stock").toLowerCase();
  if (mode === "off") return [];

  const out = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    let media = null;
    try {
      if (mode === "stock") media = await fromStock(cue.query, i);
      else if (mode === "generate") media = await fromGenerate(cue.query);
      else if (mode === "both") media = (await fromStock(cue.query, i)) || (await fromGenerate(cue.query));
    } catch (err) {
      media = { source: "error", url: null, error: err.message };
    }
    out.push({ ...cue, media });
  }
  return out;
}
