import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { mkdir, unlink } from "node:fs/promises";

import { transcribe } from "./lib/transcribe.js";
import { analyze } from "./lib/analyze.js";
import { sourceBroll } from "./lib/broll.js";
import { buildSRT } from "./lib/srt.js";

await mkdir("uploads", { recursive: true });
await mkdir("media", { recursive: true });

const upload = multer({ dest: "uploads/", limits: { fileSize: 500 * 1024 * 1024 } });
const app = express();
app.use(cors());

// Serve the editor (public/index.html) and downloaded B-roll (media/).
app.use(express.static("public"));
app.use("/media", express.static("media"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, brollMode: process.env.BROLL_MODE || "stock" });
});

// POST a video file (field "video"). Runs transcribe -> analyze -> B-roll.
app.post("/api/process", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video uploaded (field 'video')." });
  const filePath = req.file.path;
  try {
    console.log("→ transcribing", req.file.originalname);
    const { language, segments, text } = await transcribe(filePath);

    console.log("→ analyzing (language:", language + ")");
    const { clips, broll } = await analyze(language, segments);

    console.log("→ sourcing B-roll for", broll.length, "cues");
    const brollWithMedia = await sourceBroll(broll);

    res.json({ language, transcript: text, srt: buildSRT(segments), clips, broll: brollWithMedia });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    await unlink(filePath).catch(() => {});
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`\n  ClipStudio is running → open  http://localhost:${port}\n`));
