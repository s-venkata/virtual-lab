// js/llm/client.js
// Browser-side helpers for the /api endpoints.
// Uses the Vite dev proxy (/api → localhost:3001) and same-origin in prod.

export async function generateSpec(prompt, opts = {}) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...opts }),
  });
  let body;
  try { body = await res.json(); } catch { body = { ok: false, error: 'invalid json' }; }
  if (!res.ok) return { ok: false, error: body.error || `HTTP ${res.status}`, raw: body };
  return body; // { ok, spec, usage, model } | { ok: false, error, errors? }
}

export async function transcribeBlob(blob) {
  const fd = new FormData();
  fd.append('audio', blob, 'clip.webm');
  const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
  let body;
  try { body = await res.json(); } catch { body = { ok: false, error: 'invalid json' }; }
  if (!res.ok) return { ok: false, error: body.error || `HTTP ${res.status}` };
  return body; // { ok, text, model }
}

export async function getHealth() {
  const res = await fetch('/api/health');
  return res.json();
}
