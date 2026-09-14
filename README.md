# VR Lab (Master’s Thesis Project)

Browser-based WebXR/VR virtual physics laboratory.

- Frontend: Babylon.js (WebXR) + Vite
- Backend: Node.js + Express
- Multiplayer: Colyseus (WebSockets)
- Voice: WebRTC audio (peer-to-peer), signaling relayed via Colyseus
- Optional AI generator: OpenAI (`/api/generate`, `/api/transcribe`)

This repository is intended to be **public and self-hostable**: a new user should be able to clone, configure environment variables, and run locally or on a generic Ubuntu VPS **without editing application source code**.

## Architecture

Recommended production topology:

Browser
  |
HTTPS / WSS
  |
Reverse proxy (Caddy)
  |
  +-- static frontend (Vite build output + assets)
  +-- `/api`      → Node backend
  +-- `/colyseus` → Node backend (WebSockets)

The backend also serves a small runtime config endpoint:

- `/config.js` → optional browser-visible configuration (e.g. WebRTC ICE servers)

## Requirements

Choose one:

- Docker + Docker Compose (recommended for self-hosting)
- Node.js 20+ (manual dev / deployment)

## Quick Start — Local Development (Node)

From a clean clone:

1. Install dependencies:
   - `npm install`
   - `cd server && npm install`
2. Configure server environment:
   - `cp server/.env.example server/.env`
   - Edit `server/.env` (do not commit it)
3. Run frontend + backend together:
   - `npm run dev:all`
4. Open:
   - Frontend: `https://localhost:3000`
   - Backend health: `http://localhost:3001/api/health`

Notes:

- Vite runs HTTPS in dev (WebXR + microphone features work best on HTTPS/localhost).
- Vite proxies `/api`, `/colyseus`, and `/config.js` to the backend during development.

## Quick Start — Docker (recommended)

From a clean clone:

1. `cp server/.env.example server/.env`
2. Edit `server/.env` as needed
3. `docker compose up -d --build`
4. Open:
   - `http://localhost:8080`

Security note:

- `docker compose config` may render values from `server/.env`. Do not paste/share its output if it may contain secrets.

For a real domain with automatic HTTPS:

- Set `SITE_ADDRESS=your.domain` for the `web` service (see `docker-compose.yml`)
- Ensure ports `80` and `443` are reachable from the internet

## Configuration (Environment Variables)

All backend env vars are read from `server/.env` (Compose uses `env_file`).

### Required

- None strictly required for the lab to start.

### Optional (OpenAI integration)

- `OPENAI_API_KEY` — enables `/api/generate` and `/api/transcribe`
  - If unset, those endpoints return an error and the rest of the app still runs.
- `OPENAI_MODEL` — default: `gpt-4o`
- `OPENAI_TRANSCRIBE_MODEL` — default: `whisper-1`

### Optional (server/network)

- `HOST` — default `0.0.0.0`
- `PORT` — default `3001`
- `PUBLIC_ORIGIN` — informational; useful when deploying behind a reverse proxy
- `CORS_ORIGINS` — default `*` (dev-friendly). For production, prefer same-origin via reverse proxy.

### Optional (cost/rate limits)

- `DAILY_BUDGET_USD` — default `0` (disabled)
- `RATE_LIMIT_PER_MIN` — default `30`

### Optional (Voice/WebRTC ICE servers)

- `ICE_SERVERS_JSON` — JSON array of RTCIceServer objects.

Important security note:

- Anything delivered to the browser (including TURN credentials) is **public**.
- Do **not** treat TURN credentials as secrets if you inject them into client-side JS.
- For public deployments, prefer **short-lived TURN credentials** (ephemeral) generated server-side.

Examples:

- STUN-only:
  - `ICE_SERVERS_JSON=[{"urls":"stun:stun.l.google.com:19302"}]`
- TURN (browser-visible; do not use long-lived creds on a public site):
  - `ICE_SERVERS_JSON=[{"urls":["turn:turn.example.com:3478"],"username":"USER","credential":"PASS"}]`

## Networking

Development:

- Frontend: `3000` (Vite HTTPS)
- Backend: `3001` (HTTP)
- Frontend proxies:
  - `/api` → backend
  - `/colyseus` → backend (WebSockets)
  - `/config.js` → backend

Production (recommended):

- Public: `80`/`443` (reverse proxy)
- Backend: private/internal (e.g. container network only; do not expose `3001` publicly)

## HTTPS / WSS

Why HTTPS matters:

- Browser microphone access and WebRTC are safest/reliable on HTTPS (localhost is a special-case).
- The Colyseus client connects via `wss://` in production, so your reverse proxy must terminate TLS and support WebSocket upgrades on `/colyseus`.

## Voice / TURN

Default behavior:

- The client ships with a safe STUN-only default: `stun:stun.l.google.com:19302`.
- No Metered.ca account (or any third-party TURN provider) is required for basic/local use.

When TURN is needed:

- Voice can work peer-to-peer on many networks using STUN, but can fail on restrictive NATs, corporate/university networks, firewalls, or some mobile networks.
- A TURN relay is recommended for reliable production voice connectivity.

How this repo handles TURN:

- No TURN credentials are committed.
- The backend can optionally emit `globalThis.VR_LAB_ICE_SERVERS` from `ICE_SERVERS_JSON` via `/config.js`.

Security warning:

- `ICE_SERVERS_JSON` is exposed to the browser through `/config.js`.
- Any TURN username/password configured this way should be considered **browser-visible**.
- Do not treat `ICE_SERVERS_JSON` as secret storage.
- For public deployments, short-lived/ephemeral TURN credentials are preferable.

### Optional TURN with Metered.ca

Metered.ca is one possible TURN provider (not a hard dependency). You can also use another provider or your own TURN server.

Typical flow:

1. Create a Metered.ca account.
2. Obtain TURN server credentials.
3. Add an ICE configuration to `server/.env` using placeholders like:
   - `ICE_SERVERS_JSON=[{"urls":"turn:YOUR_TURN_SERVER","username":"YOUR_USERNAME","credential":"YOUR_CREDENTIAL"}]`
4. Restart the server (and your Docker stack if applicable).

Production recommendation:

- Use **short-lived TURN credentials** (ephemeral) minted server-side; do not embed long-lived TURN secrets in the browser.

## OpenAI (optional)

If `OPENAI_API_KEY` is not set:

- `/api/generate` returns an error
- `/api/transcribe` returns an error
- multiplayer + voice + the rest of the lab continue to work

## Persistent State

Current state is in-memory:

- budget tracking
- AI experiment specs stored in the Colyseus room

Restarting the server clears these.

## Custom Assets

You can provide your own assets without editing application source code by placing files under:

- `public/models/`
- `public/textures/`
- `public/splats/`

### Models

Place GLB/GLTF/OBJ/STL files in `public/models/` and reference them at runtime as:

- `/models/<your-file>`

### Textures

The lab uses PBR texture folders under `public/textures/` and references them at:

- `/textures/<set>/color.jpg`
- `/textures/<set>/normal.jpg`
- `/textures/<set>/roughness.jpg`
- `/textures/<set>/ao.jpg`

### Splats (optional)

Splat datasets are treated as user-provided and are **not committed** by default (they can be large and may be personal/private).

Workflow example:

- `cp my-scene.spz public/splats/`

To load a splat in the outdoor room, set in `server/.env`:

- `SPLAT_URL=/splats/my-scene.spz`

Notes:

- The splat URL is browser-visible and is not secret.
- If `SPLAT_URL` is empty, the splat loader is disabled.

## Production Ubuntu Deployment

### Option A (recommended): Docker + Caddy

1. Install Docker Engine + Docker Compose plugin
2. `cp server/.env.example server/.env`
3. `docker compose up -d --build`
4. Put the server on a domain and configure `SITE_ADDRESS=your.domain` for automatic HTTPS

### Option B: Manual Node + reverse proxy (advanced)

1. Run the backend:
   - `cd server && npm install && node index.js`
2. Build the frontend:
   - `npm install && npm run build`
3. Serve `dist/` plus the asset folders from your web server:
   - `public/models/`   → `/models/`
   - `public/textures/` → `/textures/`
   - `public/splats/`   → `/splats/`
   - `css/`             → `/css/`
4. Reverse proxy:
   - `/api` → backend
   - `/colyseus` → backend (WebSockets)
   - `/config.js` → backend (optional)

## Firewall

Typical public ports:

- `80` (HTTP)
- `443` (HTTPS)

Avoid exposing backend `3001` publicly when using a reverse proxy.

## Troubleshooting

- WebSocket failures:
  - Ensure your reverse proxy routes `/colyseus` and supports WebSocket upgrades.
  - Ensure you are using HTTPS/WSS on real domains.
- Voice issues:
  - STUN may fail on restrictive networks; configure TURN.
  - Remember: TURN creds injected into the browser are public; use short-lived creds.
