// js/room.js
// LAB ROOM geometry: floor, grid, walls, ceiling, skirting, ceiling lights
//
// v12: returns { floor, meshes } so roomManager can parent everything
// to a single TransformNode root for zone-based visibility culling.

import { box } from './helpers.js';

export function buildRoom(scene, M, shadow) {
  const meshes = []; // collect every mesh for roomManager

  // ── Floor ────────────────────────────────────────────────────────
  const floor = BABYLON.MeshBuilder.CreateGround(
    'floor', { width: 16, height: 16, subdivisions: 2 }, scene
  );
  floor.material        = M.floor;
  floor.checkCollisions = true;
  floor.receiveShadows  = true;
  meshes.push(floor);

  // Grid lines
  for (let i = -4; i <= 4; i += 2) {
    const gm = new BABYLON.PBRMaterial(`gm${i}`, scene);
    gm.albedoColor = new BABYLON.Color3(0.208, 0.22, 0.251);
    gm.roughness = 0.9; gm.metallic = 0;

    [box(scene, `gh${i}`, 16, 0.008, 0.025, [0, 0.005, i], gm, false, false, shadow),
     box(scene, `gv${i}`, 0.025, 0.008, 16, [i, 0.005, 0], gm, false, false, shadow)]
      .forEach(b => { b.checkCollisions = false; meshes.push(b); });
  }

  // ── Ceiling ──────────────────────────────────────────────────────
  const ceiling = box(scene, 'ceiling', 16, 0.15, 16, [0, 4.07, 0], M.ceiling, false, false, shadow);
  ceiling.checkCollisions = false;
  meshes.push(ceiling);

  // Ceiling light panels
  [[0, 0], [-4, -3], [4, -3]].forEach(([x, z], i) => {
    const lp = box(scene, `lp${i}`, 1.9, 0.04, 0.65, [x, 3.97, z], M.glowPanel, false, false, shadow);
    lp.checkCollisions = false;
    meshes.push(lp);
  });

  // ── Walls ────────────────────────────────────────────────────────
  const wallBackLo = box(scene, 'wallBack_lo', 16, 1.6, 0.14, [0, 0.8, -8], M.tile, false, false, shadow);
  wallBackLo.checkCollisions = true;
  meshes.push(wallBackLo);

  const wallBackHi = box(scene, 'wallBack_hi', 16, 2.4, 0.14, [0, 2.8, -8], M.wall, false, false, shadow);
  wallBackHi.checkCollisions = true;
  meshes.push(wallBackHi);

  const wallLeft = box(scene, 'wallLeft', 0.14, 4.0, 16, [-8, 2.0, 0], M.wall, false, false, shadow);
  wallLeft.checkCollisions = true;
  meshes.push(wallLeft);

  const wallRight = box(scene, 'wallRight', 0.14, 4.0, 16, [8, 2.0, 0], M.wall, false, false, shadow);
  wallRight.checkCollisions = true;
  meshes.push(wallRight);

  // ── Front (south) wall — split around doorway at x=-3 ────────────
  const doorCx   = -3;
  const doorW    = 1.0;
  const doorH    = 2.1;
  const leftSegW = (doorCx - doorW/2 - 0.1) - (-8);
  if (leftSegW > 0) {
    const wfl = box(scene, 'wallFront_L', leftSegW, 4.0, 0.14,
      [(-8) + leftSegW/2, 2.0, 8], M.wall, false, false, shadow);
    wfl.checkCollisions = true;
    meshes.push(wfl);
  }
  const rightSegW = 8 - (doorCx + doorW/2 + 0.1);
  if (rightSegW > 0) {
    const wfr = box(scene, 'wallFront_R', rightSegW, 4.0, 0.14,
      [(doorCx + doorW/2 + 0.1) + rightSegW/2, 2.0, 8], M.wall, false, false, shadow);
    wfr.checkCollisions = true;
    meshes.push(wfr);
  }
  const headerH = 4.0 - doorH;
  const wft = box(scene, 'wallFront_top', doorW + 0.2, headerH, 0.14,
    [doorCx, doorH + headerH/2, 8], M.wall, false, false, shadow);
  wft.checkCollisions = true;
  meshes.push(wft);

  // ── Skirting ─────────────────────────────────────────────────────
  [
    ['skirtBack', 16,   0.12, 0.06, [0,     0.06, -7.94]],
    ['skirtL',  0.06,   0.12,   16, [-7.94, 0.06,  0   ]],
    ['skirtR',  0.06,   0.12,   16, [ 7.94, 0.06,  0   ]],
  ].forEach(([n, w, h, d, p]) => {
    const s = box(scene, n, w, h, d, p, M.dkMetal, false, false, shadow);
    s.checkCollisions = false;
    meshes.push(s);
  });

  if (leftSegW > 0) {
    const sl = box(scene, 'skirtFront_L', leftSegW, 0.12, 0.06,
      [(-8) + leftSegW/2, 0.06, 7.94], M.dkMetal, false, false, shadow);
    sl.checkCollisions = false;
    meshes.push(sl);
  }
  if (rightSegW > 0) {
    const sr = box(scene, 'skirtFront_R', rightSegW, 0.12, 0.06,
      [(doorCx + doorW/2 + 0.1) + rightSegW/2, 0.06, 7.94], M.dkMetal, false, false, shadow);
    sr.checkCollisions = false;
    meshes.push(sr);
  }

  // ── Overhead pipes ────────────────────────────────────────────────
  [[-3, 3.7], [3, 3.75]].forEach(([x, y], i) => {
    const pipe = BABYLON.MeshBuilder.CreateCylinder(
      `pipe${i}`, { diameter: 0.056, height: 16, tessellation: 14 }, scene
    );
    pipe.position.set(x, y, 0);
    pipe.rotation.z      = Math.PI / 2;
    pipe.material        = M.dkMetal;
    pipe.checkCollisions = false;
    meshes.push(pipe);
  });

  return { floor, meshes };
}