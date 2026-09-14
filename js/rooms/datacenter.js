// js/rooms/datacenter.js
// Experiment sandbox room — clean empty space, ready for future use.
//
// v12: returns { floor, meshes } for roomManager.

import { box } from '../helpers.js';
import { BUILDING } from '../building.js';
// import { buildPolarizationExperiment } from '../experiments/experiment_polarization.js';
// import { buildSternGerlachExperiment } from '../experiments/experiment_sterngerlach.js';
import { buildConvexLensExperiment } from '../experiments/experiment_convexlens.js';
// in your datacenter room setup:


export function buildDatacenter(scene, M, shadow) {
  const D = BUILDING.datacenter;
  const [cx, cy, cz] = D.center;
  const [w, h, d] = D.size;
  const meshes = [];

  // ── Floor ────────────────────────────────────────────────────────
  const floor = BABYLON.MeshBuilder.CreateGround(
    'dc_floor', { width: w, height: d, subdivisions: 2 }, scene
  );
  floor.position.set(cx, cy, cz);
  floor.material        = M.floor;
  floor.checkCollisions = true;
  floor.receiveShadows  = true;
  meshes.push(floor);

  // ── Ceiling ──────────────────────────────────────────────────────
  const ceiling = box(scene, 'dc_ceiling', w, 0.15, d,
    [cx, cy + h + 0.07, cz], M.ceiling, false, false, shadow);
  ceiling.checkCollisions = false;
  meshes.push(ceiling);

  // ── Walls ─────────────────────────────────────────────────────────
  const doorX   = BUILDING.datacenter.doorPosition[0];
  const halfGap = 0.6;
  const doorH   = 2.1;

  const wallN = box(scene, 'dc_wall_n', w, h, 0.14,
    [cx, cy + h/2, cz - d/2], M.wall, false, false, shadow);
  wallN.checkCollisions = true;
  meshes.push(wallN);

  const wallE = box(scene, 'dc_wall_e', 0.14, h, d,
    [cx + w/2, cy + h/2, cz], M.wall, false, false, shadow);
  wallE.checkCollisions = true;
  meshes.push(wallE);

  const wallW = box(scene, 'dc_wall_w', 0.14, h, d,
    [cx - w/2, cy + h/2, cz], M.wall, false, false, shadow);
  wallW.checkCollisions = true;
  meshes.push(wallW);

  // South wall — split around doorway
  const segWest = (doorX - halfGap) - (cx - w/2);
  const segEast = (cx + w/2) - (doorX + halfGap);
  if (segWest > 0) {
    const s = box(scene, 'dc_wall_s1', segWest, h, 0.14,
      [(cx - w/2) + segWest/2, cy + h/2, cz + d/2],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }
  if (segEast > 0) {
    const s = box(scene, 'dc_wall_s2', segEast, h, 0.14,
      [(doorX + halfGap) + segEast/2, cy + h/2, cz + d/2],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }

  const headerH = h - doorH;
  if (headerH > 0) {
    const s = box(scene, 'dc_wall_s_top', halfGap * 2 + 0.2, headerH, 0.14,
      [doorX, doorH + headerH/2, cz + d/2],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }

  // ── Ceiling lights ────────────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const x  = cx - w/2 + (w / 4) * (i + 1);
    const lp = box(scene, `dc_light_${i}`, 1.5, 0.04, 0.5,
      [x, cy + h - 0.07, cz], M.glowPanel, false, false, shadow);
    lp.checkCollisions = false;
    meshes.push(lp);
  }

  // ── Skirting ──────────────────────────────────────────────────────
  ['n', 'e', 'w'].forEach(side => {
    const isNS = side === 'n';
    const sign  = side === 'n' ? -1 : side === 'e' ? 1 : -1;
    const skirt = box(scene, `dc_skirt_${side}`,
      isNS ? w    : 0.06,
      0.12,
      isNS ? 0.06 : d,
      isNS ? [cx, 0.06, cz + sign * (d/2 - 0.05)]
           : [cx + sign * (w/2 - 0.05), 0.06, cz],
      M.dkMetal, false, false, shadow);
    skirt.checkCollisions = false;
    meshes.push(skirt);
  });

  // ── Convex Lens Experiment ───────────────────────────────────────
const pe = buildConvexLensExperiment(scene, shadow);
pe.meshes.forEach(m => meshes.push(m));

  return { floor, meshes };
}