// server/llm/route.js
// Express router mounted at /api by server/index.js
// Endpoints:
//   POST /api/generate    JSON { prompt } → { ok, spec | error }
//   POST /api/transcribe  multipart audio → { ok, text | error }
//   GET  /api/health      → { ok, hasKey, budget }

const express = require('express');
const multer  = require('multer');
const crypto  = require('crypto');

const { generateExperimentSpec, transcribeAudio } = require('./openai');
const { validateSpec } = require('./validator');
const budget = require('./budget');

// Simple in-memory rate-limit (per IP) with periodic cleanup so the map
// doesn't grow unbounded.
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MIN || '30', 10);
const _hits = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, arr] of _hits) {
    const kept = arr.filter(t => t > cutoff);
    if (kept.length === 0) _hits.delete(ip);
    else _hits.set(ip, kept);
  }
}, 60_000).unref?.();

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anon';
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= RATE_LIMIT) {
    return res.status(429).json({ ok: false, error: 'rate limit exceeded' });
  }
  arr.push(now);
  _hits.set(ip, arr);
  next();
}

function safeId() {
  return 'exp_' + crypto.randomBytes(8).toString('hex');
}

function makeRouter() {
  const router = express.Router();

  router.use(express.json({ limit: '128kb' }));

  router.get('/health', (req, res) => {
    res.json({
      ok: true,
      hasKey: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      budget: budget.checkBudget(),
    });
  });

  // ── /api/generate ─────────────────────────────────────────────────
  router.post('/generate', rateLimit, async (req, res) => {
    const { prompt } = req.body || {};
    if (typeof prompt !== 'string' || prompt.trim().length < 3) {
      return res.status(400).json({ ok: false, error: 'prompt required (min 3 chars)' });
    }
    if (prompt.length > 1000) {
      return res.status(400).json({ ok: false, error: 'prompt too long (max 1000 chars)' });
    }
    const b = budget.checkBudget();
    if (!b.ok) {
      return res.status(429).json({ ok: false, error: 'daily budget exceeded', budget: b });
    }

    let attempt = 0;
    let lastErrors = null;
    let lastSpec = null;
    let usage = null, modelUsed = null;
    while (attempt < 2) {
      attempt++;
      // Retry uses ONLY the error trail (not the original prompt) to keep
      // token cost bounded when validation fails.
      const promptToSend = attempt === 1
        ? prompt
        : `Previous attempt failed validation:\n${(lastErrors || []).join('\n')}\nReturn ONLY the corrected JSON for the original request:\n${prompt}`;

      const r = await generateExperimentSpec(promptToSend);
      if (!r.ok) return res.status(500).json({ ok: false, error: r.error });
      usage = r.usage; modelUsed = r.model;
      budget.recordChat(r.model, r.usage);

      // Force room + stable id + deterministic t₀
      r.spec.room = 'aiLab';
      r.spec.id = safeId();
      r.spec.startedAt = Date.now();
      if (!Array.isArray(r.spec.origin) || r.spec.origin.length !== 3) {
        r.spec.origin = [38, 0, -2];
      }

      const v = validateSpec(r.spec);
      if (v.ok) {
        return res.json({ ok: true, spec: r.spec, usage, model: modelUsed });
      }
      lastErrors = v.errors;
      lastSpec = r.spec;
    }

    res.status(422).json({
      ok: false,
      error: 'spec failed validation after retry',
      errors: lastErrors,
      spec: lastSpec,
    });
  });

  // ── /api/transcribe ──────────────────────────────────────────────
  const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB
  router.post('/transcribe', rateLimit, upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: 'audio file required' });
    const b = budget.checkBudget();
    if (!b.ok) {
      return res.status(429).json({ ok: false, error: 'daily budget exceeded', budget: b });
    }

    const r = await transcribeAudio(req.file.buffer, req.file.originalname || 'clip.webm');
    if (!r.ok) return res.status(500).json({ ok: false, error: r.error });

    // Estimate ~10 KB ≈ 1 s of opus audio at 64 kbps for budget. Coarse.
    const seconds = Math.max(1, Math.round(req.file.size / 8000));
    budget.recordWhisper(seconds);

    res.json({ ok: true, text: r.text, model: r.model });
  });

  return router;
}

module.exports = { makeRouter };
