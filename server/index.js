// server/index.js
// Express HTTP server hosting:
//   - Colyseus WebSocket (Lab room) at the same port
//   - REST endpoints under /api/* (LLM generate, Whisper transcribe, health)
//
// Env: see server/.env.example

require('dotenv').config();

const http    = require('http');
const express = require('express');
const cors    = require('cors');

const { Server }             = require('@colyseus/core');
const { WebSocketTransport } = require('@colyseus/ws-transport');
const { LabRoom }            = require('./rooms/LabRoom');
const { makeRouter }         = require('./llm/route');

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

// Runtime config for the browser.
// NOTE: Anything delivered to the browser is public; do not treat ICE/TURN
// credentials as secrets. Prefer short-lived TURN creds for public deployments.
app.get('/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');

  // Optional: allow injecting ICE server config via env var.
  // Format: JSON array of RTCIceServer objects, e.g.
  //   [{"urls":"stun:stun.l.google.com:19302"}]
  //   [{"urls":["turn:turn.example.com:3478"],"username":"...","credential":"..."}]
  const lines = ['/* vr-lab config */'];

  const rawIce = process.env.ICE_SERVERS_JSON;
  if (rawIce) {
    try {
      const parsed = JSON.parse(rawIce);
      if (!Array.isArray(parsed)) throw new Error('ICE_SERVERS_JSON must be a JSON array');
      // Minimal sanity filter: keep only objects with a urls field
      const ice = parsed.filter(s => s && typeof s === 'object' && 'urls' in s);
      lines.push(`globalThis.VR_LAB_ICE_SERVERS = ${JSON.stringify(ice)};`);
    } catch (e) {
      console.warn('[config] ICE_SERVERS_JSON invalid:', e.message);
      lines.push('/* vr-lab config: invalid ICE_SERVERS_JSON */');
    }
  }

  // Optional: select a splat file for the outdoor room (public path).
  // Example: SPLAT_URL="/splats/my-scene.spz"
  const splatUrl = (process.env.SPLAT_URL || '').trim();
  if (splatUrl) {
    lines.push(`globalThis.VR_LAB_SPLAT_URL = ${JSON.stringify(splatUrl)};`);
  }

  res.send(lines.join('\n') + '\n');
});

// CORS
const origins = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: origins.includes('*') ? true : origins,
  methods: ['GET', 'POST'],
  credentials: false,
}));

// /api/* — LLM routes
app.use('/api', makeRouter());

// Default
app.get('/', (req, res) => res.send('vr-lab server'));

// HTTP server (used for both Express + Colyseus WebSocket upgrade)
const httpServer = http.createServer(app);

// Colyseus on the same HTTP server (handles WS upgrades)
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define('lab', LabRoom);

httpServer.listen(PORT, HOST, () => {
  const hasKey = !!process.env.OPENAI_API_KEY;
  console.log(`[vr-lab server] http://${HOST}:${PORT}`);
  console.log(`[vr-lab server] colyseus  ws://${HOST}:${PORT}  room=lab`);
  console.log(`[vr-lab server] LLM       /api/generate /api/transcribe /api/health`);
  console.log(`[vr-lab server] OpenAI key: ${hasKey ? 'present' : 'MISSING (set OPENAI_API_KEY)'}`);
});
