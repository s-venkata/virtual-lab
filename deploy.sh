#!/bin/bash
# Legacy (non-Docker) deployment helper.
#
# This project now supports Docker + Caddy via docker-compose.yml, which is the
# recommended self-hosting path for new deployments.
#
# This script remains for VPS-style manual deployments, but it is intentionally
# generic and does not assume a specific username, repo path, or VPS layout.
#
# Usage:
#   WEB_ROOT=/var/www/html PM2_NAME=vr-lab ./deploy.sh
#
# Stops on any error so a failed build never ships partial files.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/html}"
PM2_NAME="${PM2_NAME:-vr-lab}"

cd "$PROJECT_DIR"

echo "→ Installing/updating server dependencies..."
( cd server && npm install --omit=dev )

echo "→ Building client..."
./node_modules/.bin/vite build

echo "→ Deploying static assets to ${WEB_ROOT}..."
# Wipe stale bundles before copying new ones
sudo rm -rf "${WEB_ROOT}/assets"
sudo cp -r dist/assets    "${WEB_ROOT}/"
sudo cp    dist/index.html "${WEB_ROOT}/"

# Babylon.js loaders fetch these directly at runtime
sudo cp -r public/textures "${WEB_ROOT}/textures"
sudo cp -r public/models   "${WEB_ROOT}/models"
sudo cp -r css      "${WEB_ROOT}/"

# Splats are optional — skip if folder is missing/empty
if [ -d public/splats ] && [ -n "$(ls -A public/splats 2>/dev/null)" ]; then
  sudo cp -r public/splats "${WEB_ROOT}/splats"
fi

# js/ source is deliberately NOT copied — Vite bundles it into dist/assets/

echo "→ Restarting Node server via pm2..."
if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_NAME}"
else
  echo "   (first run — starting under pm2)"
  pm2 start server/index.js --name "${PM2_NAME}"
  pm2 save
fi

echo "→ Verifying..."
sleep 2
if curl -fsS http://localhost:3001/api/health >/dev/null; then
  echo "   ✓ /api/health OK"
else
  echo "   ✗ /api/health FAILED — check 'pm2 logs ${PM2_NAME}'"
  exit 1
fi

if pm2 list | grep "${PM2_NAME}" | grep -q online; then
  echo "   ✓ pm2 process online"
else
  echo "   ✗ pm2 process not online"
  exit 1
fi

echo "Done! Client + server updated."
