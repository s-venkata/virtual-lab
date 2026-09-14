// js/rooms/aiLab.js
// AI Lab — clean studio room dedicated to LLM-generated experiments.
//
// Identity:
//   - White + teal "studio" aesthetic to signal an AI-generation zone
//   - Grid floor decal marking where generated experiments materialize
//   - Helper sign: "Open menu → AI Lab Generator"
//   - Empty interior; runtime fills it via js/llm/runtime.js
//
// Returns { floor, meshes, lights } for roomManager + light-switch integration.

import { box } from '../helpers.js';
import { BUILDING } from '../building.js';

// Where experiments are placed (matches server/llm/route.js and runtime demos).
// Keep this exported so other modules can align to the same spawn origin.
export const AILAB_SPAWN_ORIGIN = [38, 0, -2];

export function buildAiLab(scene, M, shadow) {
  const A = BUILDING.aiLab;
  const [cx, cy, cz] = A.center;
  const [w, h, d] = A.size;
  const meshes = [];
  const lights = [];

  // ── Materials specific to the AI lab (clean white/teal studio) ───
  const studioFloorMat = new BABYLON.PBRMaterial('ai_floor_mat', scene);
  studioFloorMat.albedoColor = new BABYLON.Color3(0.92, 0.94, 0.96);
  studioFloorMat.metallic    = 0.1;
  studioFloorMat.roughness   = 0.55;

  const studioWallMat = new BABYLON.PBRMaterial('ai_wall_mat', scene);
  studioWallMat.albedoColor = new BABYLON.Color3(0.96, 0.97, 0.98);
  studioWallMat.metallic    = 0.0;
  studioWallMat.roughness   = 0.85;

  const tealAccentMat = new BABYLON.PBRMaterial('ai_accent_mat', scene);
  tealAccentMat.albedoColor       = new BABYLON.Color3(0.0, 0.85, 0.95);
  tealAccentMat.emissiveColor     = new BABYLON.Color3(0.0, 0.85, 0.95);
  tealAccentMat.emissiveIntensity = 1.2;
  tealAccentMat.metallic          = 0.3;
  tealAccentMat.roughness         = 0.4;

  // ── Floor ────────────────────────────────────────────────────────
  const floor = BABYLON.MeshBuilder.CreateGround(
    'ai_floor', { width: w, height: d, subdivisions: 2 }, scene
  );
  floor.position.set(cx, cy, cz);
  floor.material        = studioFloorMat;
  floor.checkCollisions = true;
  floor.receiveShadows  = true;
  meshes.push(floor);

  // ── Grid spawn decal ─────────────────────────────────────────────
  // Aligned to AILAB_SPAWN_ORIGIN so the grid marks the exact place where
  // experiments materialize.
  const gridTex = new BABYLON.DynamicTexture('ai_grid_tex',
    { width: 512, height: 512 }, scene, true);
  gridTex.hasAlpha = true;   // set BEFORE update() so alpha channel is honoured
  const gctx = gridTex.getContext();
  gctx.clearRect(0, 0, 512, 512);
  gctx.strokeStyle = 'rgba(0, 217, 240, 0.55)';
  gctx.lineWidth = 2;
  // 8x8 grid
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * 512;
    gctx.beginPath(); gctx.moveTo(p, 0); gctx.lineTo(p, 512); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(0, p); gctx.lineTo(512, p); gctx.stroke();
  }
  // Corner brackets
  gctx.strokeStyle = 'rgba(0, 217, 240, 0.95)';
  gctx.lineWidth = 6;
  const corners = [[20, 20], [492, 20], [20, 492], [492, 492]];
  corners.forEach(([cxp, cyp]) => {
    const dx = cxp < 256 ? 40 : -40;
    const dy = cyp < 256 ? 40 : -40;
    gctx.beginPath(); gctx.moveTo(cxp, cyp); gctx.lineTo(cxp + dx, cyp); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(cxp, cyp); gctx.lineTo(cxp, cyp + dy); gctx.stroke();
  });
  // Center label
  gctx.fillStyle = 'rgba(0, 217, 240, 0.85)';
  gctx.font = 'bold 36px monospace';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'middle';
  gctx.fillText('AI SPAWN ZONE', 256, 256);
  gridTex.update();

  const gridMat = new BABYLON.StandardMaterial('ai_grid_mat', scene);
  gridMat.diffuseTexture  = gridTex;
  gridMat.emissiveTexture = gridTex;
  gridMat.disableLighting = true;
  gridMat.useAlphaFromDiffuseTexture = true;
  gridMat.backFaceCulling = false;

  const gridDecal = BABYLON.MeshBuilder.CreateGround('ai_grid_decal',
    { width: 8, height: 8 }, scene);
  gridDecal.position.set(AILAB_SPAWN_ORIGIN[0], cy + 0.005, AILAB_SPAWN_ORIGIN[2]);
  gridDecal.material = gridMat;
  gridDecal.isPickable      = false;
  gridDecal.checkCollisions = false;
  meshes.push(gridDecal);

  // ── Ceiling ──────────────────────────────────────────────────────
  const ceiling = box(scene, 'ai_ceiling', w, 0.15, d,
    [cx, cy + h + 0.07, cz], M.ceiling, false, false, shadow);
  ceiling.material        = studioWallMat;
  ceiling.checkCollisions = false;
  meshes.push(ceiling);

  // ── Walls ─────────────────────────────────────────────────────────
  // Wall gap matches the actual door width so a closed door seals.
  const doorX    = A.doorPosition[0];
  const doorW    = A.doorWidth || 1.0;
  const doorH    = A.doorHeight || 2.1;
  const halfGap  = doorW / 2 + 0.05;   // 5 cm clearance on each side

  const wallN = box(scene, 'ai_wall_n', w, h, 0.14,
    [cx, cy + h/2, cz - d/2], M.wall, false, false, shadow);
  wallN.material        = studioWallMat;
  wallN.checkCollisions = true;
  meshes.push(wallN);

  const wallE = box(scene, 'ai_wall_e', 0.14, h, d,
    [cx + w/2, cy + h/2, cz], M.wall, false, false, shadow);
  wallE.material        = studioWallMat;
  wallE.checkCollisions = true;
  meshes.push(wallE);

  const wallW = box(scene, 'ai_wall_w', 0.14, h, d,
    [cx - w/2, cy + h/2, cz], M.wall, false, false, shadow);
  wallW.material        = studioWallMat;
  wallW.checkCollisions = true;
  meshes.push(wallW);

  // South wall — split around doorway (door connects to corridor at z=cz+d/2)
  const segWest = (doorX - halfGap) - (cx - w/2);
  const segEast = (cx + w/2) - (doorX + halfGap);
  if (segWest > 0) {
    const s = box(scene, 'ai_wall_s1', segWest, h, 0.14,
      [(cx - w/2) + segWest/2, cy + h/2, cz + d/2],
      M.wall, false, false, shadow);
    s.material        = studioWallMat;
    s.checkCollisions = true;
    meshes.push(s);
  }
  if (segEast > 0) {
    const s = box(scene, 'ai_wall_s2', segEast, h, 0.14,
      [(doorX + halfGap) + segEast/2, cy + h/2, cz + d/2],
      M.wall, false, false, shadow);
    s.material        = studioWallMat;
    s.checkCollisions = true;
    meshes.push(s);
  }

  const headerH = h - doorH;
  if (headerH > 0) {
    const s = box(scene, 'ai_wall_s_top', halfGap * 2 + 0.2, headerH, 0.14,
      [doorX, doorH + headerH/2, cz + d/2],
      M.wall, false, false, shadow);
    s.material        = studioWallMat;
    s.checkCollisions = true;
    meshes.push(s);
  }

  // ── Ceiling lights (teal accents + real SpotLights) ──────────────
  for (let i = 0; i < 3; i++) {
    const x  = cx - w/2 + (w / 4) * (i + 1);
    const lp = box(scene, `ai_light_${i}`, 1.5, 0.04, 0.5,
      [x, cy + h - 0.07, cz], M.glowPanel, false, false, shadow);
    lp.checkCollisions = false;
    meshes.push(lp);

    // Actual light — narrow-ish cone pointing straight down at the spawn zone.
    const spot = new BABYLON.SpotLight(
      `ai_spot_${i}`,
      new BABYLON.Vector3(x, cy + h - 0.1, cz),
      new BABYLON.Vector3(0, -1, 0),
      Math.PI / 2.4,       // angle
      2,                   // exponent
      scene
    );
    spot.intensity    = 0.35;
    spot.diffuse      = new BABYLON.Color3(0.85, 0.95, 1.0);
    spot.specular     = new BABYLON.Color3(0.2, 0.3, 0.4);
    spot.range        = 8;
    spot.shadowEnabled = false;
    lights.push(spot);
  }

  // Teal accent strips along the long walls (signature studio look)
  [
    { name: 'ai_accent_w', x: cx - w/2 + 0.08, z: cz },
    { name: 'ai_accent_e', x: cx + w/2 - 0.08, z: cz },
  ].forEach(cfg => {
    const strip = BABYLON.MeshBuilder.CreateBox(cfg.name, {
      width: 0.04, height: 0.06, depth: d - 1.0,
    }, scene);
    strip.position.set(cfg.x, cy + h - 0.4, cfg.z);
    strip.material        = tealAccentMat;
    strip.isPickable      = false;
    strip.checkCollisions = false;
    meshes.push(strip);
  });

  // Teal accent strip behind the helper sign on the north wall
  const northAccent = BABYLON.MeshBuilder.CreateBox('ai_accent_n', {
    width: w - 1.0, height: 0.04, depth: 0.06,
  }, scene);
  northAccent.position.set(cx, cy + h - 0.4, cz - d/2 + 0.08);
  northAccent.material        = tealAccentMat;
  northAccent.isPickable      = false;
  northAccent.checkCollisions = false;
  meshes.push(northAccent);

  // ── Skirting ──────────────────────────────────────────────────────
  ['n', 'e', 'w'].forEach(side => {
    const isNS = side === 'n';
    const sign = side === 'n' ? -1 : side === 'e' ? 1 : -1;
    const skirt = box(scene, `ai_skirt_${side}`,
      isNS ? w    : 0.06,
      0.12,
      isNS ? 0.06 : d,
      isNS ? [cx, 0.06, cz + sign * (d/2 - 0.05)]
           : [cx + sign * (w/2 - 0.05), 0.06, cz],
      M.dkMetal, false, false, shadow);
    skirt.checkCollisions = false;
    meshes.push(skirt);
  });

  // ── Helper sign on the north wall ────────────────────────────────
  const signTex = new BABYLON.DynamicTexture('ai_sign_tex',
    { width: 1024, height: 384 }, scene, true);
  const sctx = signTex.getContext();
  sctx.fillStyle = '#0a1628';
  sctx.fillRect(0, 0, 1024, 384);

  // Border
  sctx.strokeStyle = '#00d9f0';
  sctx.lineWidth = 6;
  sctx.strokeRect(8, 8, 1008, 368);

  // Title
  sctx.fillStyle = '#00d9f0';
  sctx.font = 'bold 56px monospace';
  sctx.textAlign = 'center';
  sctx.fillText('AI LAB GENERATOR', 512, 90);

  // Divider
  sctx.strokeStyle = '#00d9f088';
  sctx.lineWidth = 2;
  sctx.beginPath();
  sctx.moveTo(120, 120); sctx.lineTo(904, 120);
  sctx.stroke();

  // Instructions
  sctx.fillStyle = '#ffffff';
  sctx.font = '32px monospace';
  sctx.textAlign = 'center';
  sctx.fillText('Open the wrist menu (Y / M key)', 512, 180);
  sctx.fillText('then choose "AI Lab Generator"', 512, 224);

  sctx.fillStyle = '#aaccff';
  sctx.font = '26px monospace';
  sctx.fillText('Speak, type, or tap a preset —', 512, 282);
  sctx.fillText('the experiment appears on the grid.', 512, 318);

  sctx.fillStyle = '#ffaa44';
  sctx.font = 'italic 22px monospace';
  sctx.fillText('Powered by GPT-4o + Whisper', 512, 358);
  signTex.update();

  const signMat = new BABYLON.StandardMaterial('ai_sign_mat', scene);
  signMat.emissiveTexture = signTex;
  signMat.diffuseTexture  = signTex;
  signMat.disableLighting = true;

  const sign = BABYLON.MeshBuilder.CreatePlane('ai_sign', {
    width: 4.8, height: 1.8,
  }, scene);
  sign.position.set(cx, cy + 2.3, cz - d/2 + 0.1);
  sign.material        = signMat;
  sign.isPickable      = false;
  sign.checkCollisions = false;
  meshes.push(sign);

  // Frame around the sign
  const signFrame = BABYLON.MeshBuilder.CreateBox('ai_sign_frame', {
    width: 5.0, height: 2.0, depth: 0.03,
  }, scene);
  signFrame.position.set(cx, cy + 2.3, cz - d/2 + 0.07);
  signFrame.material        = tealAccentMat;
  signFrame.isPickable      = false;
  signFrame.checkCollisions = false;
  meshes.push(signFrame);

  console.log('[aiLab] room built — ready for AI-generated experiments');
  return { floor, meshes, lights };
}
