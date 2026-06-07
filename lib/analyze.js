// Analysis: give the transcript to an LLM and get back (a) the most clip-worthy
// moments and (b) where B-roll should go + a search query for each.
//
// Two providers:
//   groq      -> FREE (uses your GROQ_API_KEY, same key as transcription)
//   anthropic -> Claude (needs ANTHROPIC_API_KEY / console credit)

function buildPrompt(language, segments) {
  const lines = segments.map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text.trim()}`).join("\n");
  return `You are a short-form video producer. Below is a timestamped transcript (seconds) of a video. The spoken language is "${language}".

Transcript:
${lines}

Do two jobs:
1. Pick the most engaging, self-contained moments that make good short clips (15-60s each).
2. Decide where B-roll (an overlay clip) would strengthen the video, with a short English visual search query for each (2-4 words, e.g. "ocean waves sunset").

Respond with ONLY valid JSON, no markdown, in exactly this shape:
{
  "clips": [ { "start": <number>, "end": <number>, "title": "<short title>", "reason": "<why>" } ],
  "broll": [ { "start": <number>, "end": <number>, "query": "<english query>", "reason": "<why here>" } ]
}`;
}

function extractJSON(text) {
  const cleaned = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// --- Groq (OpenAI-compatible chat completions) ---
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
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`Groq analyze failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// --- Anthropic (Claude) ---
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
  return {
    clips: Array.isArray(parsed.clips) ? parsed.clips : [],
    broll: Array.isArray(parsed.broll) ? parsed.broll : [],
  };
}
