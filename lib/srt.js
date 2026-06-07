// Build an SRT subtitle file from transcript segments.
// segments: [{ start: <seconds>, end: <seconds>, text: "..." }]

function pad(n, len = 2) {
  return String(Math.floor(n)).padStart(len, "0");
}

function toTimecode(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function buildSRT(segments) {
  return segments
    .map((seg, i) => {
      const text = (seg.text || "").trim();
      return `${i + 1}\n${toTimecode(seg.start)} --> ${toTimecode(seg.end)}\n${text}\n`;
    })
    .join("\n");
}
