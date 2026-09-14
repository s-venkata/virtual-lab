// js/benches.js
// Lab bench geometry: wall benches, centre island, stools

import { box, cyl } from './helpers.js';

function makeBench(scene, M, shadow, cx) {
  box(scene, `bt_${cx}`,  5.1,  0.07, 1.45, [cx, 0.9,  -6.5],  M.bench,   true, true, shadow);
  box(scene, `bc_${cx}`,  4.65, 0.8,  0.95, [cx, 0.42, -6.76], M.cabinet, true, true, shadow);

  // Cabinet doors
  box(scene, `bd1_${cx}`, 2.1, 0.72, 0.04, [cx - 1.05, 0.42, -6.30], M.door, true, true, shadow);
  box(scene, `bd2_${cx}`, 2.1, 0.72, 0.04, [cx + 1.05, 0.42, -6.30], M.door, true, true, shadow);

  // Door handles
  cyl(scene, `bh1_${cx}`, 0.018, 0.09, [cx - 0.05, 0.42, -6.27], M.chrome, 12, true, shadow);
  cyl(scene, `bh2_${cx}`, 0.018, 0.09, [cx + 0.05, 0.42, -6.27], M.chrome, 12, true, shadow);

  // Legs
  [[-2.35, -0.72], [2.35, -0.72], [-2.35, 0.70], [2.35, 0.70]].forEach(([ox, oz], i) =>
    box(scene, `bl${i}_${cx}`, 0.08, 0.88, 0.08, [cx + ox, 0.44, -6.5 + oz], M.dkMetal, true, true, shadow)
  );
}

function makeCentreIsland(scene, M, shadow) {
  box(scene, 'ci_top',   5.1,  0.07, 2.05, [0, 0.9,  -1.0], M.bench,   true, true, shadow);
  box(scene, 'ci_shelf', 4.7,  0.05, 1.85, [0, 0.35, -1.0], M.cabinet, true, true, shadow);
  [[-2.4, -1.9], [-2.4, 0], [2.4, -1.9], [2.4, 0]].forEach(([ox, oz], i) =>
    box(scene, `ci_leg${i}`, 0.1, 0.88, 0.1, [ox, 0.44, oz], M.dkMetal, true, true, shadow)
  );
}

function makeStools(scene, M, shadow) {
  [-1.5, 0, 1.5].forEach((x, i) => {
    cyl(scene, `st_seat${i}`, 0.22, 0.05, [x, 0.75, 0.8], M.rubber, 28, true, shadow);
    cyl(scene, `st_leg${i}`,  0.022, 0.72, [x, 0.37, 0.8], M.chrome, 14, true, shadow);

    const ring = BABYLON.MeshBuilder.CreateTorus(
      `st_ring${i}`, { diameter: 0.32, thickness: 0.018, tessellation: 24 }, scene
    );
    ring.position.set(x, 0.18, 0.8);
    ring.material = M.chrome;
    shadow.addShadowCaster(ring, true);
  });
}

export function buildBenches(scene, M, shadow) {
  makeBench(scene, M, shadow, -4.5);
  makeBench(scene, M, shadow,  4.5);
  makeCentreIsland(scene, M, shadow);
  makeStools(scene, M, shadow);
}
