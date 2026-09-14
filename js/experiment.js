// js/experiment.js
// Optical Networks Lab — Wavelength Division Multiplexing (WDM) Experiment
//
// Layout (on centre bench, top-down view):
//
//   [L1 1310nm]──fiber──┐                              ┌──fiber──[PD1]
//   [L2 1490nm]──fiber──┤[MUX]──[fiber spool]──[DEMUX]─┤──fiber──[PD2]
//   [L3 1550nm]──fiber──┘                              └──fiber──[PD3]
//
//                       [  START EXPERIMENT  ]
//
// Press the button (mouse click or VR controller) to run the sequence.

import { box, cyl, sphere } from './helpers.js';

const LASERS = [
  { id: 'L1', wl: '1310nm', hex: '#ff3344', emi: '#ff0033', power: '-3.2 dBm' },
  { id: 'L2', wl: '1490nm', hex: '#33ff77', emi: '#00ff44', power: '-3.0 dBm' },
  { id: 'L3', wl: '1550nm', hex: '#bb55ff', emi: '#9900ff', power: '-3.1 dBm' },
];

// ── Text label helper ────────────────────────────────────────────────────────
function makeLabel(scene, text, pos, opts = {}) {
  const w = opts.w || 0.4, h = opts.h || 0.1;
  const tex = new BABYLON.DynamicTexture('lbl_' + text, { width: 256, height: 64 }, scene, true);
  tex.hasAlpha = true;
  tex.drawText(text, null, 44, opts.font || 'bold 32px monospace',
               opts.color || '#ffffff', 'transparent', true);

  const mat = new BABYLON.StandardMaterial('lblMat_' + text, scene);
  mat.diffuseTexture       = tex;
  mat.emissiveTexture      = tex;
  mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling      = false;
  mat.disableLighting      = true;

  const plane = BABYLON.MeshBuilder.CreatePlane('lbl_' + text, { width: w, height: h }, scene);
  plane.position.set(...pos);
  plane.material   = mat;
  plane.isPickable = false;
  if (opts.billboard !== false) plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
  return plane;
}

// Updateable digital display
function makeDisplay(scene, pos, w = 0.18, h = 0.055) {
  const tex = new BABYLON.DynamicTexture('disp', { width: 512, height: 128 }, scene, true);
  const mat = new BABYLON.StandardMaterial('dispMat', scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;

  const plane = BABYLON.MeshBuilder.CreatePlane('disp', { width: w, height: h }, scene);
  plane.position.set(...pos);
  plane.material   = mat;
  plane.isPickable = false;

  const update = (text, color = '#00ff66') => {
    tex.clear();
    const ctx = tex.getContext();
    ctx.fillStyle = '#000812'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.font = 'bold 56px "Courier New"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    tex.update();
  };
  update('-- dBm', '#445566');
  return { plane, update };
}

// ── PBR helper for emissive components ───────────────────────────────────────
function emissiveMat(scene, name, hex, intensity = 0) {
  const m = new BABYLON.PBRMaterial(name, scene);
  m.albedoColor       = BABYLON.Color3.FromHexString(hex);
  m.emissiveColor     = BABYLON.Color3.FromHexString(hex);
  m.emissiveIntensity = intensity;
  m.roughness         = 0.6;
  m.metallic          = 0.1;
  return m;
}

// ── Curved tube fiber ────────────────────────────────────────────────────────
function makeFiber(scene, name, points, color, hex, shadow) {
  const path = BABYLON.Curve3.CreateCatmullRomSpline(
    points.map(p => new BABYLON.Vector3(...p)), 16
  );

  const tube = BABYLON.MeshBuilder.CreateTube(name, {
    path: path.getPoints(),
    radius: 0.012,
    tessellation: 12,
    cap: BABYLON.Mesh.CAP_ALL,
    updatable: false,
  }, scene);

  const mat = new BABYLON.PBRMaterial(name + '_mat', scene);
  mat.albedoColor       = new BABYLON.Color3(0.05, 0.05, 0.06);
  mat.emissiveColor     = BABYLON.Color3.FromHexString(hex);
  mat.emissiveIntensity = 0;
  mat.roughness         = 0.4;
  mat.metallic          = 0.0;

  tube.material   = mat;
  tube.isPickable = false;
  if (shadow) shadow.addShadowCaster(tube, true);
  return { mesh: tube, mat };
}

// ── Build the experiment on the centre bench ─────────────────────────────────
export function buildExperiment(scene, M, shadow) {
  const Y = 0.94; // bench top
  const state = {
    running: false,
    lasers: [],
    fibersIn: [],
    fiberMain: null,
    fibersOut: [],
    pds: [],
    displays: [],
    button: null,
    buttonMat: null,
  };

  // ── 3 LASER SOURCES (back-left of bench) ───────────────────────────────────
  LASERS.forEach((L, i) => {
    const x = -2.0 + i * 0.45;
    const z = -1.7;

    // body
    const body = box(scene, `laser_body_${i}`, 0.32, 0.12, 0.22, [x, Y + 0.06, z], M.dkMetal, true, true, shadow);

    // colored emissive front face (laser output port)
    const port = box(scene, `laser_port_${i}`, 0.05, 0.05, 0.005, [x, Y + 0.06, z + 0.113],
                     emissiveMat(scene, `lp${i}`, L.hex, 0), false, false, shadow);

    // status LED (off by default — turns on green when laser fires)
    const led = sphere(scene, `laser_led_${i}`, 0.015, [x - 0.12, Y + 0.10, z - 0.10],
                       emissiveMat(scene, `ll${i}`, '#222222', 0), false, shadow);

    // wavelength label above
    makeLabel(scene, L.wl, [x, Y + 0.30, z], { color: L.hex, w: 0.32, h: 0.08 });

    state.lasers.push({ ...L, body, port, led, portMat: port.material, ledMat: led.material });
  });

  // ── MUX (Multiplexer) ──────────────────────────────────────────────────────
  const muxBody = box(scene, 'mux', 0.5, 0.16, 0.3, [-0.6, Y + 0.08, -1.4], M.cabinet, true, true, shadow);
  // 3 input ports
  for (let i = 0; i < 3; i++) {
    box(scene, `mux_in_${i}`, 0.025, 0.025, 0.012,
        [-0.85, Y + 0.05 + i * 0.04, -1.4], M.chrome, false, false, shadow);
  }
  // 1 output port (bigger, emissive when active)
  const muxOut = box(scene, 'mux_out', 0.04, 0.04, 0.012, [-0.35, Y + 0.08, -1.4],
                     emissiveMat(scene, 'muxOutMat', '#ffffff', 0), false, false, shadow);
  makeLabel(scene, 'MUX', [-0.6, Y + 0.22, -1.4], { color: '#88ccff', w: 0.18, h: 0.06 });

  // ── FIBER SPOOL (decorative, between MUX and DEMUX) ────────────────────────
  const spool = BABYLON.MeshBuilder.CreateCylinder('spool', {
    diameterTop: 0.18, diameterBottom: 0.18, height: 0.12, tessellation: 24
  }, scene);
  spool.position.set(0, Y + 0.06, -1.0);
  spool.rotation.x = Math.PI / 2;
  spool.material = M.dkMetal;
  shadow.addShadowCaster(spool, true);

  // wrap a glowing torus around spool to simulate coiled fiber
  const coilMat = new BABYLON.PBRMaterial('coilMat', scene);
  coilMat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.12);
  coilMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  coilMat.emissiveIntensity = 0;
  coilMat.roughness = 0.3;
  for (let i = 0; i < 5; i++) {
    const t = BABYLON.MeshBuilder.CreateTorus(`coil${i}`, {
      diameter: 0.20, thickness: 0.012, tessellation: 28
    }, scene);
    t.position.set(0, Y + 0.02 + i * 0.022, -1.0);
    t.material = coilMat;
  }
  state.coilMat = coilMat;
  makeLabel(scene, '50 km SMF-28', [0, Y + 0.22, -1.0], { color: '#aaccff', w: 0.45, h: 0.07 });

  // ── DEMUX (Demultiplexer) ──────────────────────────────────────────────────
  const demuxBody = box(scene, 'demux', 0.5, 0.16, 0.3, [0.6, Y + 0.08, -1.4], M.cabinet, true, true, shadow);
  // 1 input port
  const demuxIn = box(scene, 'demux_in', 0.04, 0.04, 0.012, [0.35, Y + 0.08, -1.4],
                      emissiveMat(scene, 'demuxInMat', '#ffffff', 0), false, false, shadow);
  // 3 output ports
  for (let i = 0; i < 3; i++) {
    box(scene, `demux_out_${i}`, 0.025, 0.025, 0.012,
        [0.85, Y + 0.05 + i * 0.04, -1.4], M.chrome, false, false, shadow);
  }
  makeLabel(scene, 'DEMUX', [0.6, Y + 0.22, -1.4], { color: '#88ccff', w: 0.22, h: 0.06 });

  // ── 3 PHOTODETECTORS (back-right of bench) ─────────────────────────────────
  LASERS.forEach((L, i) => {
    const x = 1.2 + i * 0.45;
    const z = -1.7;
    const body = box(scene, `pd_body_${i}`, 0.32, 0.16, 0.22, [x, Y + 0.08, z], M.dkMetal, true, true, shadow);

    // photodiode face
    const face = cyl(scene, `pd_face_${i}`, 0.04, 0.012, [x, Y + 0.08, z - 0.115],
                     emissiveMat(scene, `pf${i}`, L.hex, 0), 24, false, shadow);
    face.rotation.x = Math.PI / 2;

    // RX LED
    const led = sphere(scene, `pd_led_${i}`, 0.015, [x + 0.12, Y + 0.13, z - 0.08],
                       emissiveMat(scene, `pl${i}`, '#222222', 0), false, shadow);

    // digital readout
    const disp = makeDisplay(scene, [x, Y + 0.20, z + 0.02], 0.20, 0.06);

    makeLabel(scene, 'PD' + (i + 1), [x, Y + 0.32, z], { color: L.hex, w: 0.18, h: 0.07 });
    state.pds.push({ ...L, body, face, led, faceMat: face.material, ledMat: led.material });
    state.displays.push(disp);
  });

  // ── FIBER CONNECTIONS ──────────────────────────────────────────────────────
  // Lasers → MUX
  state.lasers.forEach((L, i) => {
    const x = -2.0 + i * 0.45;
    const fiber = makeFiber(scene, `fIn_${i}`, [
      [x,    Y + 0.06, -1.59],            // laser front
      [x,    Y + 0.06, -1.40],
      [-0.6, Y + 0.06, -1.40],
      [-0.85,Y + 0.05 + i*0.04, -1.40],   // mux input
    ], L.hex, L.hex, shadow);
    state.fibersIn.push(fiber);
  });

  // MUX → spool → DEMUX (main combined fiber)
  state.fiberMain = makeFiber(scene, 'fMain', [
    [-0.35, Y + 0.08, -1.40],   // mux out
    [-0.10, Y + 0.08, -1.20],
    [-0.10, Y + 0.08, -1.00],   // spool entry
    [ 0.10, Y + 0.08, -1.00],   // spool exit
    [ 0.10, Y + 0.08, -1.20],
    [ 0.35, Y + 0.08, -1.40],   // demux in
  ], '#ffffff', '#ffffff', shadow);

  // DEMUX → Photodetectors
  state.lasers.forEach((L, i) => {
    const x = 1.2 + i * 0.45;
    const fiber = makeFiber(scene, `fOut_${i}`, [
      [0.85, Y + 0.05 + i*0.04, -1.40],   // demux output
      [0.6,  Y + 0.06, -1.40],
      [x,    Y + 0.06, -1.40],
      [x,    Y + 0.06, -1.59],            // pd face
    ], L.hex, L.hex, shadow);
    state.fibersOut.push(fiber);
  });

  // ── START BUTTON (front-centre of bench) ───────────────────────────────────
  // base ring
  const ring = BABYLON.MeshBuilder.CreateTorus('btn_ring', {
    diameter: 0.16, thickness: 0.012, tessellation: 32
  }, scene);
  ring.position.set(0, Y + 0.012, -0.4);
  ring.material = M.chrome;
  shadow.addShadowCaster(ring, true);

  // button cap
  const btnMat = emissiveMat(scene, 'btnMat', '#cc0000', 0.4);
  btnMat.metallic = 0.2;
  const button = BABYLON.MeshBuilder.CreateCylinder('btn', {
    diameter: 0.13, height: 0.04, tessellation: 32
  }, scene);
  button.position.set(0, Y + 0.025, -0.4);
  button.material = btnMat;
  shadow.addShadowCaster(button, true);
  state.button    = button;
  state.buttonMat = btnMat;

  makeLabel(scene, 'START', [0, Y + 0.16, -0.4], { color: '#ff5544', w: 0.25, h: 0.08 });

  // Status panel (small display next to button)
  const status = makeDisplay(scene, [0, Y + 0.10, -0.55], 0.30, 0.06);
  status.update('READY', '#ffaa00');
  state.status = status;

  // Title hovering above the experiment
  makeLabel(scene, 'WDM 3-CHANNEL OPTICAL LINK', [0, Y + 0.55, -1.0],
            { color: '#00e5ff', w: 1.2, h: 0.14, font: 'bold 36px monospace' });

  // ── INTERACTION ────────────────────────────────────────────────────────────
  button.actionManager = new BABYLON.ActionManager(scene);

  // hover scale
  button.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
    BABYLON.ActionManager.OnPointerOverTrigger,
    () => { button.scaling = new BABYLON.Vector3(1.08, 1.08, 1.08); btnMat.emissiveIntensity = 0.9; }
  ));
  button.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
    BABYLON.ActionManager.OnPointerOutTrigger,
    () => { button.scaling = new BABYLON.Vector3(1, 1, 1); btnMat.emissiveIntensity = 0.4; }
  ));

  // click / VR-trigger
  button.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
    BABYLON.ActionManager.OnPickTrigger,
    () => runExperiment(state)
  ));

  return state;
}

// ── ANIMATION SEQUENCE ───────────────────────────────────────────────────────
function runExperiment(state) {
  if (state.running) return;
  state.running = true;
  state.status.update('RUNNING', '#00ff66');
  state.buttonMat.emissiveColor = BABYLON.Color3.FromHexString('#00ff44');

  const setEmi = (mat, hex, intensity) => {
    mat.emissiveColor = BABYLON.Color3.FromHexString(hex);
    mat.emissiveIntensity = intensity;
  };

  // Step 1 — fire each laser sequentially
  state.lasers.forEach((L, i) => {
    setTimeout(() => {
      setEmi(L.ledMat,  '#00ff44', 6);            // status LED → green
      setEmi(L.portMat, L.hex,    8);             // emissive output port
      setEmi(state.fibersIn[i].mat, L.hex, 3);    // fiber lights up
    }, 200 + i * 350);
  });

  // Step 2 — MUX combines, main fiber glows white
  setTimeout(() => {
    setEmi(state.fiberMain.mat, '#ffffff', 2.5);
    state.coilMat.emissiveIntensity = 1.5;
    state.status.update('TX ACTIVE', '#00ff66');
  }, 1500);

  // Step 3 — DEMUX splits, output fibers glow
  setTimeout(() => {
    state.fibersOut.forEach((f, i) => {
      setEmi(f.mat, state.lasers[i].hex, 3);
    });
  }, 2200);

  // Step 4 — photodetectors receive
  setTimeout(() => {
    state.pds.forEach((pd, i) => {
      setEmi(pd.faceMat, pd.hex,    5);
      setEmi(pd.ledMat,  '#00ff44', 6);
      // animated power readout
      let dbm = -50;
      const target = parseFloat(pd.power);
      const tick = setInterval(() => {
        dbm += 1.2 + Math.random() * 0.4;
        if (dbm >= target) {
          dbm = target;
          state.displays[i].update(dbm.toFixed(1) + ' dBm', '#00ff66');
          clearInterval(tick);
        } else {
          state.displays[i].update(dbm.toFixed(1) + ' dBm', '#00ff66');
        }
      }, 50);
    });
    state.status.update('RX LOCK', '#00ff66');
  }, 2700);

  // Auto-reset after 12 s
  setTimeout(() => resetExperiment(state), 12000);
}

function resetExperiment(state) {
  const reset = (mat) => { mat.emissiveIntensity = 0; };

  state.lasers.forEach((L, i) => {
    reset(L.ledMat);
    reset(L.portMat);
    reset(state.fibersIn[i].mat);
  });
  reset(state.fiberMain.mat);
  state.coilMat.emissiveIntensity = 0;

  state.fibersOut.forEach(f => reset(f.mat));
  state.pds.forEach((pd, i) => {
    reset(pd.faceMat);
    reset(pd.ledMat);
    state.displays[i].update('-- dBm', '#445566');
  });

  state.buttonMat.emissiveColor = BABYLON.Color3.FromHexString('#cc0000');
  state.buttonMat.emissiveIntensity = 0.4;
  state.status.update('READY', '#ffaa00');
  state.running = false;
}
