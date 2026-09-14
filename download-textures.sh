#!/usr/bin/env bash
# download-textures.sh
# Downloads CC0 PBR textures from ambientCG.com and standardises file names.

set -e
cd "$(dirname "$0")"

command -v curl  >/dev/null || { echo "✗ curl not installed.  sudo apt install curl";  exit 1; }
command -v unzip >/dev/null || { echo "✗ unzip not installed.  sudo apt install unzip"; exit 1; }

download() {
  local asset_id=$1
  local out_dir=$2
  local url="https://ambientcg.com/get?file=${asset_id}.zip"
  local tmp="/tmp/${asset_id}.zip"

  mkdir -p "$out_dir"
  echo ""
  echo "→ Downloading $asset_id…"
  if ! curl -fL --silent --show-error "$url" -o "$tmp"; then
    echo "  ✗ Failed to download $asset_id"
    return 1
  fi

  echo "→ Extracting → $out_dir"
  unzip -oq "$tmp" -d "$out_dir/"
  rm -f "$tmp"

  cd "$out_dir"
  mv -f *_Color.jpg            color.jpg     2>/dev/null || true
  mv -f *_NormalGL.jpg         normal.jpg    2>/dev/null || true
  mv -f *_Roughness.jpg        roughness.jpg 2>/dev/null || true
  mv -f *_AmbientOcclusion.jpg ao.jpg        2>/dev/null || true
  rm -f *_Displacement.jpg *_NormalDX.jpg *_PREVIEW.* *.usdc *.usda README.txt 2>/dev/null || true
  cd - >/dev/null
  echo "  ✓ $out_dir done"
}

# ── Texture set ─────────────────────────────────────────────────
download "Concrete033_2K-JPG"       "textures/concrete"   # floor
download "Wood050_2K-JPG"           "textures/wood"       # bench tops & wood items
download "PaintedPlaster017_2K-JPG" "textures/wall"       # walls

echo ""
echo "✓ All textures ready."
ls -la textures/concrete/ textures/wood/ textures/wall/
