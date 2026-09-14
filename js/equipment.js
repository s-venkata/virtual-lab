// js/equipment.js
// Lab equipment — for OPTICAL NETWORKS LAB
// Centre bench is now used by experiment.js (WDM setup).
// This file builds the surrounding lab infrastructure:
//   microscope (fiber inspection), monitor, sink, whiteboard,
//   shelving, door, fire extinguisher, safety sign

import { box, cyl, sphere } from './helpers.js';

// ── Microscope (fiber inspection scope) ───────────────────────────────────────
function buildMicroscope(scene, M, shadow) {
  const root = new BABYLON.TransformNode('microscope', scene);
  root.position.set(-5.5, 0.9, -6.58);

  const part = (n, w, h, d, p, mat) => {
    const b = BABYLON.MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, scene);
    b.parent = root; b.position.set(...p); b.material = mat;
    shadow.addShadowCaster(b, true);
    return b;
  };

  const darkPBR = new BABYLON.PBRMaterial('micDark', scene);
  darkPBR.albedoColor = new BABYLON.Color3(0.165, 0.176, 0.212);
  darkPBR.roughness = 0.4; darkPBR.metallic = 0.7;

  part('m_base',   0.28, 0.045, 0.22, [0, 0, 0],          M.dkMetal);
  part('m_pillar', 0.065, 0.38, 0.065, [0, 0.21, 0.04],   darkPBR);
  part('m_arm',    0.055, 0.04, 0.18, [-0.01, 0.4, -0.02],darkPBR);
  part('m_head',   0.13, 0.11, 0.13, [0, 0.41, -0.05],    darkPBR);
  part('m_stage',  0.18, 0.018, 0.15, [0, 0.23, 0],       M.metal);

  cyl(scene, 'm_eye', 0.028, 0.14, [-5.5, 1.39, -6.63], M.dkMetal, 12, true, shadow);
  cyl(scene, 'm_obj', 0.022, 0.09, [-5.5, 1.26, -6.63], M.chrome,  12, true, shadow);
}

// ── Monitor (right bench — control PC) ────────────────────────────────────────
function buildMonitor(scene, M, shadow) {
  box(scene, 'mon_foot',  0.20, 0.02, 0.20, [3.5, 0.91, -6.50], M.dkMetal, true, true, shadow);
  cyl(scene, 'mon_stem',  0.035, 0.20, [3.5, 1.01, -6.50], M.dkMetal, 16, true, shadow);
  box(scene, 'mon_back',  0.58, 0.38, 0.045,[3.5, 1.27, -6.50], M.dkMetal, true, true, shadow);
  box(scene, 'mon_disp',  0.52, 0.32, 0.010,[3.5, 1.27, -6.475],M.screen,  true, true, shadow);
  box(scene, 'keyboard',  0.42, 0.012, 0.16,[3.5, 0.912,-6.29], M.dkMetal, true, true, shadow);

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      const k = box(scene, `key_${r}_${c}`, 0.042, 0.006, 0.038,
        [3.08 + c * 0.054, 0.92, -6.35 + r * 0.045], M.cabinet, false, false, shadow);
      k.checkCollisions = false;
    }
  }
}

// ── Optical Spectrum Analyser (right bench — replaces centrifuge) ────────────
function buildOSA(scene, M, shadow) {
  box(scene, 'osa_body',  0.42, 0.30, 0.32, [5.5, 1.05, -6.50], M.cent,    true, true, shadow);
  box(scene, 'osa_disp',  0.32, 0.16, 0.012,[5.5, 1.13, -6.345],M.centDisp,false,false,shadow);
  box(scene, 'osa_panel', 0.40, 0.06, 0.045,[5.5, 0.95, -6.345],M.cent,    true, true, shadow);

  // knobs and LEDs
  cyl(scene, 'osa_knob1', 0.020, 0.020, [5.42, 0.95, -6.322], M.chrome,  16, true, shadow);
  cyl(scene, 'osa_knob2', 0.020, 0.020, [5.50, 0.95, -6.322], M.chrome,  16, true, shadow);
  cyl(scene, 'osa_knob3', 0.020, 0.020, [5.58, 0.95, -6.322], M.chrome,  16, true, shadow);
  sphere(scene, 'osa_pwr',  0.012, [5.65, 0.95, -6.322], M.ledGrn,    false, shadow);

  // OSA label
  const tex = new BABYLON.DynamicTexture('osaLbl', { width: 256, height: 64 }, scene, true);
  tex.hasAlpha = true;
  tex.drawText('OSA AQ-6315', null, 44, 'bold 28px monospace', '#00e5ff', 'transparent', true);
  const lblMat = new BABYLON.StandardMaterial('osaLblMat', scene);
  lblMat.diffuseTexture = tex; lblMat.emissiveTexture = tex;
  lblMat.diffuseTexture.hasAlpha = true; lblMat.useAlphaFromDiffuseTexture = true;
  lblMat.disableLighting = true; lblMat.backFaceCulling = false;
  const lbl = BABYLON.MeshBuilder.CreatePlane('osaLbl', { width: 0.30, height: 0.075 }, scene);
  lbl.position.set(5.5, 1.245, -6.345); lbl.material = lblMat;
  lbl.isPickable = false;
}

// ── Sink ──────────────────────────────────────────────────────────────────────
function buildSink(scene, M, shadow) {
  box(scene, 'sink_basin',   0.50, 0.07, 0.40, [-3.5, 0.94, -6.55], M.sink,   true, true, shadow);
  box(scene, 'sink_inner',   0.44, 0.10, 0.34, [-3.5, 0.96, -6.55], M.sink,   false,false,shadow);
  cyl(scene, 'faucet_base',  0.030, 0.06, [-3.5, 0.97, -6.70], M.chrome, 16, true, shadow);
  cyl(scene, 'faucet_stem',  0.022, 0.18, [-3.5, 1.07, -6.70], M.chrome, 16, true, shadow);
  box(scene, 'faucet_spout', 0.14, 0.022, 0.022,[-3.46,1.17,-6.63],M.chrome,  true, true, shadow);
  cyl(scene, 'faucet_tip',   0.015, 0.03, [-3.40,1.16,-6.58], M.chrome, 12, true, shadow);
}

// ── Whiteboard with fiber-link diagram ───────────────────────────────────────
function buildWhiteboard(scene, M, shadow) {
  box(scene, 'wb_frame',   3.65, 1.75, 0.07, [0, 2.3, -7.89], M.shelf, true, true, shadow);
  box(scene, 'wb_surface', 3.50, 1.60, 0.04, [0, 2.3, -7.855],M.white, true, true, shadow);

  // Title strip
  [[0.8,0.025,-0.8,2.50],[0.5,0.020,0.2,2.40],
   [1.1,0.022,-0.25,2.22],[0.6,0.020,0.7,2.35]].forEach(([w,h,x,y],i)=>{
    const l = box(scene, `ch${i}`, w, h, 0.008, [x, y, -7.835], M.chalk, false, false, shadow);
    l.checkCollisions = false;
  });

  const diag = BABYLON.MeshBuilder.CreateTorus(
    'diag_circ', { diameter: 0.36, thickness: 0.015, tessellation: 32 }, scene
  );
  diag.position.set(1.1, 2.28, -7.835);
  diag.rotation.x = Math.PI / 2;
  diag.material   = M.chalk;
  shadow.addShadowCaster(diag, true);
}

// ── Shelving (fiber spools / patch cords) ────────────────────────────────────
function buildShelving(scene, M, shadow) {
  box(scene, 'shf_back', 0.06, 3.6, 1.85, [7.5, 1.8, -4], M.shelf, true, true, shadow);
  [0.5, 1.2, 1.9, 2.6, 3.3].forEach((y, i) =>
    box(scene, `shf_p${i}`, 0.055, 0.04, 1.75, [7.5, y, -4], M.metal, true, true, shadow)
  );

  // fiber spools (drum-like)
  [-3.5, -3.8, -4.1].forEach((z, i) => {
    const spool = BABYLON.MeshBuilder.CreateCylinder(
      `spool_s${i}`, { diameter: 0.16, height: 0.10, tessellation: 24 }, scene
    );
    spool.position.set(7.5, 0.74, z);
    spool.rotation.z = Math.PI / 2;
    spool.material = ['#222', '#444', '#666'].map((hex,k) => {
      const m = new BABYLON.PBRMaterial(`spm${k}`, scene);
      m.albedoColor = BABYLON.Color3.FromHexString(hex);
      m.roughness = 0.6; m.metallic = 0.3;
      return m;
    })[i];
    shadow.addShadowCaster(spool, true);
  });

  box(scene, 'sbox1', 0.055, 0.28, 0.22, [7.5, 0.76, -4.45], M.wood,  true, true, shadow);
  box(scene, 'sbox2', 0.055, 0.22, 0.20, [7.5, 0.72, -4.72], M.shelf, true, true, shadow);
}

// ── Door ──────────────────────────────────────────────────────────────────────
function buildDoor(scene, M, shadow) {
  box(scene, 'door_frame',  0.04, 2.35, 1.15, [-7.88, 1.18, 2], M.cabinet, true, true, shadow);
  box(scene, 'door_panel',  0.07, 2.15, 0.98, [-7.84, 1.08, 2], M.door,    true, true, shadow);
  box(scene, 'door_win',    0.04, 0.44, 0.42, [-7.82, 1.55, 2], M.doorWin, true, true, shadow);
  box(scene, 'door_frameL', 0.06, 2.35, 0.06, [-7.86, 1.18, 1.52], M.dkMetal, false,false,shadow);
  box(scene, 'door_frameR', 0.06, 2.35, 0.06, [-7.86, 1.18, 2.48], M.dkMetal, false,false,shadow);

  const handle = cyl(scene, 'door_handle', 0.022, 0.13, [-7.79, 1.1, 2.42], M.chrome, 14, true, shadow);
  handle.rotation.z = Math.PI / 2;
}

function buildExtinguisher(scene, M, shadow) {
  cyl(scene, 'ext_body',  0.065, 0.52, [-7.58, 0.74, 1.3], M.red,    20, true, shadow);
  cyl(scene, 'ext_top',   0.040, 0.09, [-7.58, 1.01, 1.3], M.chrome, 16, true, shadow);
  cyl(scene, 'ext_hose',  0.012, 0.18, [-7.54, 1.07, 1.3], M.dkMetal,10, true, shadow);
  sphere(scene, 'ext_gauge',0.035,    [-7.52, 0.90, 1.23], M.white,      true, shadow);
}

function buildSign(scene, M, shadow) {
  box(scene, 'sign_bg',  0.04, 0.5, 0.75, [-7.87, 2.5, -5], M.yellow,  false,false,shadow);
  box(scene, 'sign_txt', 0.02, 0.35,0.58, [-7.85, 2.5, -5], M.dkMetal, false,false,shadow);
}

// ── Public API ────────────────────────────────────────────────────────────────
export function buildEquipment(scene, M, shadow) {
  // buildMicroscope(scene, M, shadow);
  // buildMonitor(scene, M, shadow);
  // buildOSA(scene, M, shadow);
  // buildSink(scene, M, shadow);
  buildWhiteboard(scene, M, shadow);
  buildShelving(scene, M, shadow);
  buildDoor(scene, M, shadow);
  // buildExtinguisher(scene, M, shadow);
  buildSign(scene, M, shadow);
}
