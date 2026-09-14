// js/rooms/corridor.js
// Corridor connecting Lab, Datacenter, and Outdoor area.
// Includes glowing fiber strands on ceiling matching WDM wavelengths.
//
// v12: returns { floor, meshes } for roomManager.
// Note: corridor is always visible — roomManager never disables it.

import { box, cyl } from '../helpers.js';
import { BUILDING } from '../building.js';

export function buildCorridor(scene, M, shadow) {
  const C = BUILDING.corridor;
  const [cx, cy, cz] = C.center;
  const [w, h, d] = C.size;
  const meshes = [];

  // ── Floor ────────────────────────────────────────────────────────
  const floor = BABYLON.MeshBuilder.CreateGround(
    'corridor_floor', { width: w, height: d, subdivisions: 2 }, scene
  );
  floor.position.set(cx, cy, cz);
  floor.material        = M.floor;
  floor.checkCollisions = true;
  floor.receiveShadows  = true;
  meshes.push(floor);

  // ── Ceiling ──────────────────────────────────────────────────────
  const ceiling = box(scene, 'corridor_ceiling', w, 0.15, d,
    [cx, cy + h + 0.07, cz], M.ceiling, false, false, shadow);
  ceiling.checkCollisions = false;
  meshes.push(ceiling);

  // ── North wall — 4 segments around lab + datacenter + aiLab doorways ─
  const northZ    = cz - d / 2;
  const labDoorX  = BUILDING.lab.doorPosition[0];
  const dcDoorX   = BUILDING.datacenter.doorPosition[0];
  const aiDoorX   = BUILDING.aiLab.doorPosition[0];

  const seg1Width = (labDoorX - 0.6) - (cx - w/2);
  if (seg1Width > 0) {
    const s = box(scene, 'corridor_wall_n1', seg1Width, h, 0.14,
      [(cx - w/2) + seg1Width/2, cy + h/2, northZ],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }

  const seg2Width = (dcDoorX - 0.6) - (labDoorX + 0.6);
  if (seg2Width > 0) {
    const s = box(scene, 'corridor_wall_n2', seg2Width, h, 0.14,
      [(labDoorX + 0.6) + seg2Width/2, cy + h/2, northZ],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }

  const seg3Width = (aiDoorX - 0.6) - (dcDoorX + 0.6);
  if (seg3Width > 0) {
    const s = box(scene, 'corridor_wall_n3', seg3Width, h, 0.14,
      [(dcDoorX + 0.6) + seg3Width/2, cy + h/2, northZ],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }

  const seg4Width = (cx + w/2) - (aiDoorX + 0.6);
  if (seg4Width > 0) {
    const s = box(scene, 'corridor_wall_n4', seg4Width, h, 0.14,
      [(aiDoorX + 0.6) + seg4Width/2, cy + h/2, northZ],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }

  // Headers above the three north doorways
  const corridorDoorH    = 2.1;
  const corridorHeaderH  = h - corridorDoorH;
  if (corridorHeaderH > 0) {
    [labDoorX, dcDoorX, aiDoorX].forEach((dx, i) => {
      const s = box(scene, `corridor_wall_n_top_${i}`, 1.4, corridorHeaderH, 0.14,
        [dx, corridorDoorH + corridorHeaderH/2, northZ],
        M.wall, false, false, shadow);
      s.checkCollisions = true;
      meshes.push(s);
    });
  }

  // ── South wall — split around outdoor doorway ─────────────────────
  const southZ       = cz + d / 2;
  const outdoorDoorX = BUILDING.outdoor.doorPosition[0];
  const segSouth1    = (outdoorDoorX - 0.7) - (cx - w/2);
  const segSouth2    = (cx + w/2) - (outdoorDoorX + 0.7);

  if (segSouth1 > 0) {
    const s = box(scene, 'corridor_wall_s1', segSouth1, h, 0.14,
      [(cx - w/2) + segSouth1/2, cy + h/2, southZ],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }
  if (segSouth2 > 0) {
    const s = box(scene, 'corridor_wall_s2', segSouth2, h, 0.14,
      [(outdoorDoorX + 0.7) + segSouth2/2, cy + h/2, southZ],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }

  const cdrDoorH  = 2.1;
  const cdrHeaderH = h - cdrDoorH;
  if (cdrHeaderH > 0) {
    const s = box(scene, 'corridor_wall_s_top', 1.6 + 0.2, cdrHeaderH, 0.14,
      [outdoorDoorX, cdrDoorH + cdrHeaderH/2, southZ],
      M.wall, false, false, shadow);
    s.checkCollisions = true;
    meshes.push(s);
  }

  // ── East and west end caps ────────────────────────────────────────
  const wallE = box(scene, 'corridor_wall_e', 0.14, h, d,
    [cx + w/2, cy + h/2, cz], M.wall, false, false, shadow);
  wallE.checkCollisions = true;
  meshes.push(wallE);

  const wallW = box(scene, 'corridor_wall_w', 0.14, h, d,
    [cx - w/2, cy + h/2, cz], M.wall, false, false, shadow);
  wallW.checkCollisions = true;
  meshes.push(wallW);

  // ── Ceiling light strips ──────────────────────────────────────────
  const stripCount = 7; // bumped from 5 → 7 for the longer corridor
  for (let i = 0; i < stripCount; i++) {
    const x  = cx - w/2 + (w / (stripCount + 1)) * (i + 1);
    const lp = box(scene, `corridor_light_${i}`, 1.5, 0.04, 0.4,
      [x, cy + h - 0.1, cz], M.glowPanel, false, false, shadow);
    lp.checkCollisions = false;
    meshes.push(lp);
  }

  // ── Glowing fiber strands — WDM wavelengths ───────────────────────
  const fiberMat = (hex) => {
    const m = new BABYLON.PBRMaterial(`fiber_${hex}`, scene);
    m.albedoColor       = BABYLON.Color3.FromHexString(hex);
    m.emissiveColor     = BABYLON.Color3.FromHexString(hex);
    m.emissiveIntensity = 1.2;
    m.roughness         = 0.3;
    return m;
  };

  [
    { hex: '#ff3344', name: '1310nm', offsetZ: -0.6 },
    { hex: '#33ff77', name: '1490nm', offsetZ:  0.0 },
    { hex: '#bb55ff', name: '1550nm', offsetZ:  0.6 },
  ].forEach(wl => {
    const fiber = BABYLON.MeshBuilder.CreateCylinder(`fiber_${wl.name}`, {
      diameter: 0.025, height: w - 0.5, tessellation: 12,
    }, scene);
    fiber.position.set(cx, cy + h - 0.2, cz + wl.offsetZ);
    fiber.rotation.z      = Math.PI / 2;
    fiber.material        = fiberMat(wl.hex);
    fiber.checkCollisions = false;
    meshes.push(fiber);
  });

  // ── Skirting ──────────────────────────────────────────────────────
  const skirtN = box(scene, 'corridor_skirt_n', w, 0.12, 0.06,
    [cx, 0.06, northZ + 0.05], M.dkMetal, false, false, shadow);
  skirtN.checkCollisions = false;
  meshes.push(skirtN);

  const skirtS = box(scene, 'corridor_skirt_s', w, 0.12, 0.06,
    [cx, 0.06, southZ - 0.05], M.dkMetal, false, false, shadow);
  skirtS.checkCollisions = false;
  meshes.push(skirtS);

  return { floor, meshes };
}