// js/experiments/experiment_photoelectric.js
// Photoelectric Effect — Einstein's Nobel Prize experiment
//
// Layout (inside datacenter room, offset from polarization bench):
//
//   [LIGHT SOURCE panel] ──beam──► [METAL PLATE] ──electrons──► [COLLECTOR]
//                                       ↓
//                                  [AMMETER panel]
//
// Physics (Einstein 1905):
//   E_photon = h × f           (photon energy)
//   KE_max   = h×f − φ         (max kinetic energy of emitted electron)
//   V_stop   = KE_max / e      (stopping voltage)
//   Electrons only emit if E_photon > φ (work function of metal)
//
// Interaction (NO rotation needed):
//   - VR laser pointer + trigger on frequency buttons to select UV/Visible/IR
//   - VR laser pointer + trigger on metal selector to pick Zinc/Sodium/Copper
//   - Panel shows photon energy, work function, KE, stopping voltage in real time
//   - Particle burst animates when emission occurs, nothing when it doesn't
//
// Returns { meshes } for roomManager registration.

import { BUILDING } from '../building.js';

// ── Physical constants ────────────────────────────────────────────────────────
const H_EV = 4.136e-15;   // Planck's constant in eV·s
const C     = 3e8;         // speed of light m/s

// Frequency presets (Hz) and display colours
const FREQUENCIES = [
  { label: 'γ-ray',    freq: 3.0e19,  color: new BABYLON.Color3(0.6, 0.0, 0.8), nm: 0.01  },
  { label: 'X-ray',    freq: 3.0e17,  color: new BABYLON.Color3(0.4, 0.0, 1.0), nm: 1      },
  { label: 'UV-C',     freq: 1.5e15,  color: new BABYLON.Color3(0.8, 0.0, 1.0), nm: 200    },
  { label: 'UV-A',     freq: 8.2e14,  color: new BABYLON.Color3(0.6, 0.0, 0.9), nm: 365    },
  { label: 'Violet',   freq: 7.5e14,  color: new BABYLON.Color3(0.5, 0.0, 1.0), nm: 400    },
  { label: 'Blue',     freq: 6.7e14,  color: new BABYLON.Color3(0.0, 0.3, 1.0), nm: 450    },
  { label: 'Green',    freq: 5.5e14,  color: new BABYLON.Color3(0.0, 0.9, 0.1), nm: 550    },
  { label: 'Yellow',   freq: 5.1e14,  color: new BABYLON.Color3(1.0, 0.9, 0.0), nm: 590    },
  { label: 'Orange',   freq: 4.8e14,  color: new BABYLON.Color3(1.0, 0.5, 0.0), nm: 625    },
  { label: 'Red',      freq: 4.3e14,  color: new BABYLON.Color3(1.0, 0.0, 0.0), nm: 700    },
  { label: 'Near IR',  freq: 3.0e14,  color: new BABYLON.Color3(0.6, 0.0, 0.0), nm: 1000   },
  { label: 'Mid IR',   freq: 1.0e13,  color: new BABYLON.Color3(0.4, 0.0, 0.0), nm: 30000  },
];

// Metal work functions in eV
const METALS = [
  { label: 'Caesium (Cs)', phi: 2.1  },
  { label: 'Potassium (K)',phi: 2.3  },
  { label: 'Sodium (Na)',  phi: 2.36 },
  { label: 'Zinc (Zn)',    phi: 4.3  },
  { label: 'Aluminium',   phi: 4.08 },
  { label: 'Copper (Cu)', phi: 4.7  },
  { label: 'Gold (Au)',   phi: 5.1  },
  { label: 'Platinum',    phi: 5.65 },
];

export function buildPhotoelectricExperiment(scene, shadow) {
  const meshes = [];
  const D  = BUILDING.datacenter;
  const cx = D.center[0];   // offset left of polarization bench
  const cy = 0;
  const cz = D.center[2];   // toward center of room

  const benchY = 1.0;
  const eyeY   = benchY + 0.2;

  // ── State ────────────────────────────────────────────────────────────────
  let selectedFreqIdx  = 4;   // Violet default
  let selectedMetalIdx = 2;   // Sodium default
  let electronParticles = [];
  let emissionActive   = false;

  // ── Materials ─────────────────────────────────────────────────────────────
  const standMat = new BABYLON.PBRMaterial('pe_stand', scene);
  standMat.albedoColor = new BABYLON.Color3(0.25, 0.25, 0.28);
  standMat.metallic = 0.8; standMat.roughness = 0.3;

  const metalMat = new BABYLON.PBRMaterial('pe_metal', scene);
  metalMat.albedoColor = new BABYLON.Color3(0.7, 0.7, 0.75);
  metalMat.metallic = 0.95; metalMat.roughness = 0.1;

  const glassMat = new BABYLON.PBRMaterial('pe_glass', scene);
  glassMat.albedoColor = new BABYLON.Color3(0.7, 0.9, 1.0);
  glassMat.alpha = 0.3; glassMat.metallic = 0.0; glassMat.roughness = 0.05;
  glassMat.backFaceCulling = false;

  // Beam material — updated dynamically
  const beamMat = new BABYLON.StandardMaterial('pe_beam', scene);
  beamMat.emissiveColor = FREQUENCIES[selectedFreqIdx].color;
  beamMat.disableLighting = true;
  beamMat.alpha = 0.7;

  // Light source housing mat
  const sourceMat = new BABYLON.PBRMaterial('pe_source', scene);
  sourceMat.albedoColor = new BABYLON.Color3(0.15, 0.15, 0.18);
  sourceMat.metallic = 0.6; sourceMat.roughness = 0.4;

  // ═══════════════════════════════════════════════════════════════════
  // OPTICAL BENCH
  // ═══════════════════════════════════════════════════════════════════
  const bench = BABYLON.MeshBuilder.CreateBox('pe_bench', {
    width: 4, height: 0.08, depth: 0.8,
  }, scene);
  bench.position.set(cx, benchY - 0.04, cz);
  bench.material = standMat;
  bench.checkCollisions = false;
  bench.receiveShadows = true;
  if (shadow) shadow.addShadowCaster(bench, true);
  meshes.push(bench);

  // ═══════════════════════════════════════════════════════════════════
  // LIGHT SOURCE (left side)
  // ═══════════════════════════════════════════════════════════════════
  const sourceX = cx - 2.8;

  const sourceBox = BABYLON.MeshBuilder.CreateBox('pe_source_box', {
    width: 0.35, height: 0.35, depth: 0.35,
  }, scene);
  sourceBox.position.set(sourceX, eyeY, cz);
  sourceBox.material = sourceMat;
  sourceBox.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(sourceBox, true);
  meshes.push(sourceBox);

  // Emissive lens face
  const lensFaceMat = new BABYLON.StandardMaterial('pe_lens_face', scene);
  lensFaceMat.emissiveColor = FREQUENCIES[selectedFreqIdx].color;
  lensFaceMat.disableLighting = true;

  const lens = BABYLON.MeshBuilder.CreateDisc('pe_lens', {
    radius: 0.1, tessellation: 32,
  }, scene);
  lens.position.set(sourceX + 0.18, eyeY, cz);
  lens.rotation.y = Math.PI / 2;
  lens.material = lensFaceMat;
  lens.checkCollisions = false;
  meshes.push(lens);

  // Source post
  const sourcePost = BABYLON.MeshBuilder.CreateCylinder('pe_source_post', {
    diameter: 0.04, height: eyeY - benchY, tessellation: 12,
  }, scene);
  sourcePost.position.set(sourceX, benchY + (eyeY - benchY) / 2, cz);
  sourcePost.material = standMat;
  sourcePost.checkCollisions = false;
  meshes.push(sourcePost);

  _makeLabel(scene, 'LIGHT\nSOURCE', sourceX, eyeY + 0.26, cz, meshes);

  // ═══════════════════════════════════════════════════════════════════
  // LIGHT BEAM
  // ═══════════════════════════════════════════════════════════════════
  const plateX  = cx;
  const beamLen = plateX - sourceX - 0.2;

  const beam = BABYLON.MeshBuilder.CreateCylinder('pe_beam_cyl', {
    diameter: 0.04, height: beamLen, tessellation: 12,
  }, scene);
  beam.position.set(sourceX + 0.18 + beamLen / 2, eyeY, cz);
  beam.rotation.z = Math.PI / 2;
  beam.material = beamMat;
  beam.checkCollisions = false;
  meshes.push(beam);

  // ═══════════════════════════════════════════════════════════════════
  // VACUUM TUBE (glass cylinder housing plate + collector)
  // ═══════════════════════════════════════════════════════════════════
  const tube = BABYLON.MeshBuilder.CreateCylinder('pe_tube', {
    diameter: 0.6, height: 1.1, tessellation: 32,
  }, scene);
  tube.position.set(plateX + 0.6, eyeY, cz);
  tube.rotation.z = Math.PI / 2;
  tube.material = glassMat;
  tube.checkCollisions = false;
  meshes.push(tube);

  // ═══════════════════════════════════════════════════════════════════
  // METAL PLATE (cathode)
  // ═══════════════════════════════════════════════════════════════════
  const plate = BABYLON.MeshBuilder.CreateBox('pe_plate', {
    width: 0.05, height: 0.4, depth: 0.4,
  }, scene);
  plate.position.set(plateX + 0.08, eyeY, cz);
  plate.material = metalMat;
  plate.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(plate, true);
  meshes.push(plate);

  // Plate post
  const platePost = BABYLON.MeshBuilder.CreateCylinder('pe_plate_post', {
    diameter: 0.035, height: eyeY - benchY, tessellation: 12,
  }, scene);
  platePost.position.set(plateX + 0.08, benchY + (eyeY - benchY) / 2, cz);
  platePost.material = standMat;
  platePost.checkCollisions = false;
  meshes.push(platePost);

  _makeLabel(scene, 'METAL\nCATHODE', plateX, eyeY + 0.4, cz, meshes);

  // ═══════════════════════════════════════════════════════════════════
  // COLLECTOR (anode)
  // ═══════════════════════════════════════════════════════════════════
  const collectorX = plateX + 1.1;
  const collectorMat = new BABYLON.PBRMaterial('pe_collector', scene);
  collectorMat.albedoColor = new BABYLON.Color3(0.9, 0.7, 0.1);
  collectorMat.metallic = 0.9; collectorMat.roughness = 0.2;

  const collector = BABYLON.MeshBuilder.CreateBox('pe_collector', {
    width: 0.05, height: 0.35, depth: 0.35,
  }, scene);
  collector.position.set(collectorX, eyeY, cz);
  collector.material = collectorMat;
  collector.checkCollisions = false;
  meshes.push(collector);

  _makeLabel(scene, 'ANODE\n(collector)', collectorX, eyeY + 0.4, cz, meshes);

  // Wire connecting plate and collector to ammeter (visual only)
  const wireMat = new BABYLON.StandardMaterial('pe_wire', scene);
  wireMat.emissiveColor = new BABYLON.Color3(0.6, 0.4, 0.0);
  wireMat.disableLighting = true;

  // ═══════════════════════════════════════════════════════════════════
  // AMMETER (current gauge)
  // ═══════════════════════════════════════════════════════════════════
  const ammeterX = plateX + 0.6;
  const ammeterZ = cz - 0.6;

  const ammeterTex = new BABYLON.DynamicTexture('pe_ammeter_tex',
    { width: 256, height: 256 }, scene, true);
  const ammeterMat = new BABYLON.StandardMaterial('pe_ammeter_mat', scene);
  ammeterMat.emissiveTexture = ammeterTex;
  ammeterMat.diffuseTexture = ammeterTex;
  ammeterMat.disableLighting = true;

  const ammeterFace = BABYLON.MeshBuilder.CreateDisc('pe_ammeter_face', {
    radius: 0.25, tessellation: 64,
  }, scene);
  ammeterFace.position.set(ammeterX, eyeY - 0.1, ammeterZ);
  ammeterFace.rotation.x = -Math.PI / 4;
  ammeterFace.material = ammeterMat;
  ammeterFace.checkCollisions = false;
  meshes.push(ammeterFace);

  const ammeterRim = BABYLON.MeshBuilder.CreateTorus('pe_ammeter_rim', {
    diameter: 0.52, thickness: 0.025, tessellation: 48,
  }, scene);
  ammeterRim.position.copyFrom(ammeterFace.position);
  ammeterRim.rotation.x = -Math.PI / 4;
  ammeterRim.material = standMat;
  ammeterRim.checkCollisions = false;
  meshes.push(ammeterRim);

  _makeLabel(scene, 'AMMETER', ammeterX, eyeY + 0.35, ammeterZ, meshes);

  // ═══════════════════════════════════════════════════════════════════
  // MAIN READOUT PANEL
  // ═══════════════════════════════════════════════════════════════════
  const panelTex = new BABYLON.DynamicTexture('pe_panel_tex',
    { width: 512, height: 384 }, scene, true);
  const panelMat = new BABYLON.StandardMaterial('pe_panel_mat', scene);
  panelMat.emissiveTexture = panelTex;
  panelMat.diffuseTexture  = panelTex;
  panelMat.disableLighting = true;

  const panelFrame = BABYLON.MeshBuilder.CreateBox('pe_panel_frame', {
    width: 1.66, height: 1.26, depth: 0.03,
  }, scene);
  panelFrame.position.set(cx + 3.2, 2.0, D.center[2] - D.size[2] / 2 + 0.02);
  panelFrame.material = standMat;
  panelFrame.checkCollisions = false;
  meshes.push(panelFrame);

  const panel = BABYLON.MeshBuilder.CreatePlane('pe_panel', {
    width: 1.6, height: 1.2,
  }, scene);
  panel.position.set(cx + 3.2, 2.0, D.center[2] - D.size[2] / 2 + 0.05);
  panel.material = panelMat;
  panel.checkCollisions = false;
  meshes.push(panel);

  // ═══════════════════════════════════════════════════════════════════
  // FREQUENCY SELECTOR (button grid on a panel)
  // ═══════════════════════════════════════════════════════════════════
  const freqPanelX = cx - 2.0;
  const freqPanelY = 1.9;
  const freqPanelZ = D.center[2] - D.size[2] / 2 + 0.05;

  // Background plate
  const freqBgMat = new BABYLON.StandardMaterial('pe_freqbg', scene);
  freqBgMat.emissiveColor = new BABYLON.Color3(0.04, 0.06, 0.1);
  freqBgMat.disableLighting = true;

  const freqBg = BABYLON.MeshBuilder.CreatePlane('pe_freqbg', {
    width: 1.1, height: 2.4,
  }, scene);
  freqBg.position.set(freqPanelX, freqPanelY, freqPanelZ);
  freqBg.material = freqBgMat;
  freqBg.checkCollisions = false;
  meshes.push(freqBg);

  _makeLabel(scene, 'FREQUENCY\nSELECTOR', freqPanelX, freqPanelY + 1.3, freqPanelZ, meshes);

  // Build one button per frequency
  const freqButtons = [];
  FREQUENCIES.forEach((f, i) => {
    const btnTex = new BABYLON.DynamicTexture(`pe_freq_tex_${i}`,
      { width: 256, height: 64 }, scene, true);
    const btnMat = new BABYLON.StandardMaterial(`pe_freq_mat_${i}`, scene);
    btnMat.emissiveTexture = btnTex;
    btnMat.diffuseTexture  = btnTex;
    btnMat.disableLighting = true;

    const btn = BABYLON.MeshBuilder.CreatePlane(`pe_freq_btn_${i}`, {
      width: 0.95, height: 0.16,
    }, scene);
    // Stack buttons vertically
    btn.position.set(
      freqPanelX,
      freqPanelY + 1.1 - i * 0.19,
      freqPanelZ + 0.01
    );
    btn.material = btnMat;
    btn.isPickable = true;
    btn.checkCollisions = false;
    meshes.push(btn);
    freqButtons.push({ btn, btnTex, btnMat, freq: f, idx: i });

    _drawFreqButton(btnTex, f, i === selectedFreqIdx);

    // Click action
    btn.actionManager = new BABYLON.ActionManager(scene);
    btn.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
      BABYLON.ActionManager.OnPickTrigger,
      () => {
        selectedFreqIdx = i;
        _applySelection(scene, meshes, freqButtons, metalButtons,
          selectedFreqIdx, selectedMetalIdx,
          beam, beamMat, lensFaceMat, panelTex, ammeterTex,
          plate, electronParticles);
      }
    ));
  });

  // ═══════════════════════════════════════════════════════════════════
  // METAL SELECTOR
  // ═══════════════════════════════════════════════════════════════════
  const metalPanelX = cx + 3.8;
  const metalPanelY = 1.9;
  const metalPanelZ = D.center[2] - D.size[2] / 2 + 0.05;

  const metalBg = BABYLON.MeshBuilder.CreatePlane('pe_metalbg', {
    width: 1.0, height: 1.8,
  }, scene);
  metalBg.position.set(metalPanelX, metalPanelY, metalPanelZ);
  metalBg.material = freqBgMat;
  metalBg.checkCollisions = false;
  meshes.push(metalBg);

  _makeLabel(scene, 'METAL\nSELECTOR', metalPanelX, metalPanelY + 1.0, metalPanelZ, meshes);

  const metalButtons = [];
  METALS.forEach((m, i) => {
    const btnTex = new BABYLON.DynamicTexture(`pe_metal_tex_${i}`,
      { width: 256, height: 64 }, scene, true);
    const btnMat = new BABYLON.StandardMaterial(`pe_metal_mat_${i}`, scene);
    btnMat.emissiveTexture = btnTex;
    btnMat.diffuseTexture  = btnTex;
    btnMat.disableLighting = true;

    const btn = BABYLON.MeshBuilder.CreatePlane(`pe_metal_btn_${i}`, {
      width: 0.88, height: 0.17,
    }, scene);
    btn.position.set(
      metalPanelX,
      metalPanelY + 0.78 - i * 0.19,
      metalPanelZ + 0.01
    );
    btn.material = btnMat;
    btn.isPickable = true;
    btn.checkCollisions = false;
    meshes.push(btn);
    metalButtons.push({ btn, btnTex, metal: m, idx: i });

    _drawMetalButton(btnTex, m, i === selectedMetalIdx);

    btn.actionManager = new BABYLON.ActionManager(scene);
    btn.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
      BABYLON.ActionManager.OnPickTrigger,
      () => {
        selectedMetalIdx = i;
        _applySelection(scene, meshes, freqButtons, metalButtons,
          selectedFreqIdx, selectedMetalIdx,
          beam, beamMat, lensFaceMat, panelTex, ammeterTex,
          plate, electronParticles);
      }
    ));
  });

  // ═══════════════════════════════════════════════════════════════════
  // TASK SIGN
  // ═══════════════════════════════════════════════════════════════════
  const taskTex = new BABYLON.DynamicTexture('pe_task_tex',
    { width: 512, height: 96 }, scene, true);
  const taskCtx = taskTex.getContext();
  taskCtx.fillStyle = '#001133';
  taskCtx.fillRect(0, 0, 512, 96);
  taskCtx.fillStyle = '#00e5ff';
  taskCtx.font = 'bold 22px monospace';
  taskCtx.textAlign = 'center';
  taskCtx.fillText('TASK: Find the minimum frequency that ejects electrons', 256, 38);
  taskCtx.fillStyle = '#888';
  taskCtx.font = '18px monospace';
  taskCtx.fillText('Select frequency and metal using the panels on the walls', 256, 72);
  taskTex.update();

  const taskMat = new BABYLON.StandardMaterial('pe_task_mat', scene);
  taskMat.emissiveTexture = taskTex;
  taskMat.diffuseTexture  = taskTex;
  taskMat.disableLighting = true;

  const taskSign = BABYLON.MeshBuilder.CreatePlane('pe_task_sign', {
    width: 2.6, height: 0.5,
  }, scene);
  taskSign.position.set(cx, 2.7, cz - 0.4);
  taskSign.rotation.x = -0.15;
  taskSign.material = taskMat;
  taskSign.checkCollisions = false;
  meshes.push(taskSign);

  // ── Initial draw ──────────────────────────────────────────────────
  _applySelection(scene, meshes, freqButtons, metalButtons,
    selectedFreqIdx, selectedMetalIdx,
    beam, beamMat, lensFaceMat, panelTex, ammeterTex,
    plate, electronParticles);

  console.log('[photoelectric] experiment built');
  return { meshes };
}

// ═══════════════════════════════════════════════════════════════════
// APPLY SELECTION — update everything when freq or metal changes
// ═══════════════════════════════════════════════════════════════════
function _applySelection(scene, meshes, freqButtons, metalButtons,
  freqIdx, metalIdx,
  beam, beamMat, lensFaceMat, panelTex, ammeterTex,
  plate, electronParticles) {

  const freq  = FREQUENCIES[freqIdx];
  const metal = METALS[metalIdx];

  // Photon energy (eV)
  const E_photon = H_EV * freq.freq;
  const phi      = metal.phi;
  const emits    = E_photon > phi;
  const KE_max   = emits ? E_photon - phi : 0;
  const V_stop   = emits ? KE_max : 0;

  // Update beam colour
  beamMat.emissiveColor = freq.color;
  beamMat.alpha = 0.8;
  lensFaceMat.emissiveColor = freq.color;

  // Update main panel
  _drawPanel(panelTex, freq, metal, E_photon, phi, KE_max, V_stop, emits);

  // Update ammeter
  _drawAmmeter(ammeterTex, emits, KE_max);

  // Update frequency buttons
  freqButtons.forEach(({ btnTex, freq: f, idx }) =>
    _drawFreqButton(btnTex, f, idx === freqIdx));

  // Update metal buttons
  metalButtons.forEach(({ btnTex, metal: m, idx }) =>
    _drawMetalButton(btnTex, m, idx === metalIdx));

  // Electron particles
  electronParticles.forEach(p => { try { p.dispose(); } catch(e) {} });
  electronParticles.length = 0;

  if (emits) {
    _spawnElectrons(scene, plate, freq.color, KE_max, electronParticles, meshes);
  }
}

// ═══════════════════════════════════════════════════════════════════
// ELECTRON PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════════
function _spawnElectrons(scene, plate, color, KE_max, electronParticles, meshes) {
  const ps = new BABYLON.ParticleSystem('pe_electrons', 80, scene);
  ps.particleTexture = new BABYLON.Texture(
    'https://assets.babylonjs.com/textures/flare.png', scene);

  ps.emitter = plate.position.clone().add(new BABYLON.Vector3(0.05, 0, 0));
  ps.minEmitBox = new BABYLON.Vector3(0, -0.15, -0.15);
  ps.maxEmitBox = new BABYLON.Vector3(0,  0.15,  0.15);

  // Speed proportional to sqrt(KE_max), capped
  const speed = Math.min(0.3 + Math.sqrt(KE_max) * 0.4, 1.8);

  ps.direction1 = new BABYLON.Vector3(speed, 0.3, 0.3);
  ps.direction2 = new BABYLON.Vector3(speed * 1.3, -0.3, -0.3);
  ps.minLifeTime = 0.4;
  ps.maxLifeTime = 0.9;
  ps.emitRate    = 35;
  ps.minSize     = 0.02;
  ps.maxSize     = 0.05;
  ps.color1      = new BABYLON.Color4(color.r, color.g, color.b, 1.0);
  ps.color2      = new BABYLON.Color4(1, 1, 0.8, 0.8);
  ps.colorDead   = new BABYLON.Color4(0.1, 0.1, 0.1, 0.0);
  ps.gravity     = new BABYLON.Vector3(0, -0.4, 0);
  ps.start();
  electronParticles.push(ps);
}

// ═══════════════════════════════════════════════════════════════════
// DRAW HELPERS
// ═══════════════════════════════════════════════════════════════════
function _drawPanel(tex, freq, metal, E_photon, phi, KE_max, V_stop, emits) {
  const ctx = tex.getContext();
  ctx.fillStyle = '#001122';
  ctx.fillRect(0, 0, 512, 384);

  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('PHOTOELECTRIC EFFECT', 20, 38);

  ctx.fillStyle = '#444';
  ctx.font = '15px monospace';
  ctx.fillText('E = hf   KE_max = hf − φ   V_stop = KE/e', 20, 60);

  // Frequency row
  ctx.fillStyle = '#aaa';
  ctx.font = '18px monospace';
  ctx.fillText('Frequency:', 20, 98);
  ctx.fillStyle = `rgb(${Math.round(freq.color.r*255)},${Math.round(freq.color.g*255)},${Math.round(freq.color.b*255)})`;
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`${freq.label}  (${freq.nm < 1 ? freq.nm.toExponential(0) : freq.nm} nm)`, 180, 98);

  // Photon energy
  ctx.fillStyle = '#aaa'; ctx.font = '18px monospace';
  ctx.fillText('Photon energy (hf):', 20, 130);
  ctx.fillStyle = '#ffdd00'; ctx.font = 'bold 22px monospace';
  ctx.fillText(`${E_photon.toFixed(2)} eV`, 280, 130);

  // Work function
  ctx.fillStyle = '#aaa'; ctx.font = '18px monospace';
  ctx.fillText(`Work fn φ (${metal.label}):`, 20, 162);
  ctx.fillStyle = '#ff8844'; ctx.font = 'bold 22px monospace';
  ctx.fillText(`${phi.toFixed(2)} eV`, 280, 162);

  // Divider
  ctx.strokeStyle = '#335';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 178); ctx.lineTo(492, 178); ctx.stroke();

  // Emission result
  if (emits) {
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('✓ EMISSION OCCURS', 20, 210);

    ctx.fillStyle = '#aaa'; ctx.font = '18px monospace';
    ctx.fillText('Max KE of electron:', 20, 244);
    ctx.fillStyle = '#00ff88'; ctx.font = 'bold 22px monospace';
    ctx.fillText(`${KE_max.toFixed(3)} eV`, 280, 244);

    ctx.fillStyle = '#aaa'; ctx.font = '18px monospace';
    ctx.fillText('Stopping voltage:', 20, 276);
    ctx.fillStyle = '#00ff88'; ctx.font = 'bold 22px monospace';
    ctx.fillText(`${V_stop.toFixed(3)} V`, 280, 276);
  } else {
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('✗ NO EMISSION', 20, 210);
    ctx.fillStyle = '#ff6666';
    ctx.font = '18px monospace';
    ctx.fillText('hf < φ  — photon energy too low', 20, 244);
    ctx.fillText(`Need at least ${phi.toFixed(2)} eV`, 20, 272);
  }

  // Threshold freq note
  const f_thresh = phi / H_EV;
  ctx.fillStyle = '#556';
  ctx.font = '14px monospace';
  ctx.fillText(`Threshold freq: ${f_thresh.toExponential(2)} Hz`, 20, 310);
  ctx.fillText(`hf − φ = ${(E_photon - phi).toFixed(3)} eV`, 20, 330);

  // Formula footer
  ctx.fillStyle = '#334';
  ctx.font = '13px monospace';
  ctx.fillText('h = 4.136×10⁻¹⁵ eV·s    (Einstein 1905, Nobel 1921)', 20, 368);

  tex.update();
}

function _drawAmmeter(tex, emits, KE_max) {
  const ctx = tex.getContext();
  const W = 256, H = 256, cx = W/2, cy = H/2 + 20, r = 90;

  ctx.fillStyle = '#111a11';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 15, 0, Math.PI * 2);
  ctx.fill();

  // Arc background
  ctx.strokeStyle = '#223322';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 0.15);
  ctx.stroke();

  // Current arc (green when emitting)
  const current = emits ? Math.min(KE_max / 5, 1.0) : 0;
  if (current > 0) {
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 10;
    ctx.beginPath();
    const startAngle = Math.PI * 0.85;
    const endAngle   = startAngle + current * (Math.PI * 1.3);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.stroke();
  }

  // Needle
  const needleAngle = Math.PI * 0.85 + current * (Math.PI * 1.3) - Math.PI / 2;
  ctx.strokeStyle = '#ff4400';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(needleAngle) * (r - 8), cy + Math.sin(needleAngle) * (r - 8));
  ctx.stroke();

  // Centre dot
  ctx.fillStyle = '#ccc';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Labels
  ctx.fillStyle = '#00cc44';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('μA', cx, cy - r - 5);
  ctx.fillText(emits ? (current * 100).toFixed(1) : '0.0', cx, cy + 26);

  tex.update();
}

function _drawFreqButton(tex, freq, selected) {
  const ctx = tex.getContext();
  const c = freq.color;
  ctx.fillStyle = selected ? `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},0.35)` : '#0a0f14';
  ctx.fillRect(0, 0, 256, 64);
  if (selected) {
    ctx.strokeStyle = `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 60);
  }
  ctx.fillStyle = `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;
  ctx.font = `${selected ? 'bold ' : ''}16px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(freq.label, 12, 28);
  ctx.fillStyle = '#778';
  ctx.font = '13px monospace';
  ctx.fillText(`${freq.freq.toExponential(1)} Hz`, 12, 50);
  tex.update();
}

function _drawMetalButton(tex, metal, selected) {
  const ctx = tex.getContext();
  ctx.fillStyle = selected ? '#1a2a1a' : '#0a0f14';
  ctx.fillRect(0, 0, 256, 64);
  if (selected) {
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 60);
  }
  ctx.fillStyle = selected ? '#00ff88' : '#aaa';
  ctx.font = `${selected ? 'bold ' : ''}15px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(metal.label, 10, 26);
  ctx.fillStyle = '#ff8844';
  ctx.font = '13px monospace';
  ctx.fillText(`φ = ${metal.phi} eV`, 10, 50);
  tex.update();
}

function _makeLabel(scene, text, x, y, z, meshes) {
  const lines = text.split('\n');
  const tex   = new BABYLON.DynamicTexture(`pe_lbl_${x}_${z}`, { width: 256, height: 80 }, scene, true);
  const ctx   = tex.getContext();
  ctx.clearRect(0, 0, 256, 80);
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => ctx.fillText(line, 128, 26 + i * 26));
  tex.update();

  const mat = new BABYLON.StandardMaterial(`pe_lbl_mat_${x}_${z}`, scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  if (mat.diffuseTexture) mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;

  const plane = BABYLON.MeshBuilder.CreatePlane(`pe_lbl_plane_${x}_${z}`, {
    width: 0.7, height: 0.22,
  }, scene);
  plane.position.set(x, y, z);
  plane.billboardMode  = BABYLON.Mesh.BILLBOARDMODE_Y;
  plane.material       = mat;
  plane.checkCollisions = false;
  meshes.push(plane);
}
