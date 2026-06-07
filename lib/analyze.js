function videoDuration(segments) {
  return segments.reduce((m, s) => Math.max(m, s.end || 0), 0);
}

function buildPrompt(language, segments) {
  const dur = Math.round(videoDuration(segments));
  const lines = segments.map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text.trim()}`).join("\n");

  return `You are an expert short-form (vertical) video editor. Below is a timestamped transcript (seconds). Spoken language: "${language}". Total length: about ${dur} seconds.

Transcript:
${lines}

TASK 1 - CLIPS: pick the strongest self-contained moments (15-60s each) that would work as standalone short clips. Give start, end, a short title, and a one-line reason.

TASK 2 - B-ROLL PLACEMENT (be strict; quality over quantity).
B-roll is an overlay clip shown on top of the speaker. Good B-roll LITERALLY ILLUSTRATES a concrete thing the speaker names at that exact moment. Follow ALL of these rules:
- ONLY add B-roll when the words at that timestamp name something you can show on screen: a place, object, food, animal, activity, or scene (e.g. "the beaches in Bali", "making latte art", "a vintage car"). The query must depict THAT thing.
- NEVER add B-roll over: the first 3 seconds (the hook), abstract/opinion lines with nothing visual ("I think...", "it's really important", "you guys should..."), filler, transitions, or emotional/punchline moments where the speaker's face matters.
- Each B-roll must START exactly when the keyword is spoken and be SHORT: 2-4 seconds. Never longer.
- Keep the speaker visible between clips: leave at least ~6 seconds between two B-rolls. Do not stack them back-to-back.
- Use AT MOST about 1 B-roll per 15 seconds of video. Fewer, perfectly-timed B-rolls beat many random ones. If the video has no concrete visual references, return an empty "broll" list.
- "query": a literal, specific English phrase of exactly what to show, 2-4 words (e.g. "bali beach aerial", NOT "travel" or "lifestyle").
- "reason": quote the exact transcript phrase this B-roll illustrates.

Respond with ONLY valid JSON, no markdown, in exactly this shape:
{
  "clips": [ { "start": <number>, "end": <number>, "title": "<short>", "reason": "<why>" } ],
  "broll": [ { "start": <number>, "end": <number>, "query": "<literal english>", "reason": "<the exact phrase being illustrated>" } ]
}`;
}

function extractJSON(text) {
  const cleaned = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function sanitizeBroll(broll, dur) {
  const MIN_GAP = 6;
  const MAX_LEN = 4;
  const MIN_LEN = 1.5;
  const maxCount = Math.max(1, Math.floor(dur / 15));

  const cleaned = broll
    .filter((b) => typeof b.start === "number" && typeof b.end === "number" && b.query)
    .map((b) => {
      let s = Math.max(0, b.start);
      let e = b.end > s ? b.end : s + 3;
      if (e - s > MAX_LEN) e = s + 3;       // too long -> trim to 3s
      if (e - s < MIN_LEN) e = s + MIN_LEN; // too short -> floor
      e = Math.min(e, dur);
      return { ...b, start: +s.toFixed(2), end: +e.toFixed(2) };
    })
    .sort((a, b) => a.start - b.start);

  const out = [];
  let lastEnd = -Infinity;
  for (const b of cleaned) {
    if (out.length >= maxCount) break;
    if (b.start - lastEnd < MIN_GAP) continue; // skip overlaps / too-close clips
    out.push(b);
    lastEnd = b.end;
  }
  return out;
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is missing in .env");
  const model = process.env.ANALYZE_MODEL || "llama-3.3-70b-versatile";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Groq analyze failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is missing in .env");
  const model = process.env.ANALYZE_MODEL || "claude-haiku-4-5-20251001";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic analyze failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

export async function analyze(language, segments) {
  const provider = (process.env.ANALYZE_PROVIDER || "groq").toLowerCase();
  const prompt = buildPrompt(language, segments);
  let text;
  if (provider === "groq") text = await callGroq(prompt);
  else if (provider === "anthropic") text = await callAnthropic(prompt);
  else throw new Error(`Unknown ANALYZE_PROVIDER "${provider}" (use "groq" or "anthropic").`);

  const parsed = extractJSON(text);
  const dur = videoDuration(segments);
  return {
    clips: Array.isArray(parsed.clips) ? parsed.clips : [],
    broll: sanitizeBroll(Array.isArray(parsed.broll) ? parsed.broll : [], dur),
  };
}