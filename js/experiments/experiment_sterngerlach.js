// js/experiments/experiment_sterngerlach.js
// Stern-Gerlach Experiment - Quantum Spin
//
// Layout (left to right):
//   Oven -> two collimator slits -> inhomogeneous magnet -> detector screen
//
// Magnet design (asymmetric, per the original experiment):
//   N pole: red block + narrow wedge tip pointing INTO the gap
//   S pole: flat blue block sitting on the bench
//
// Detector: cream screen with grey classical-expectation centre line.
// No floating label boards - only FIRE / RESET buttons + wall readout.

import { BUILDING } from '../building.js';
import { getRoom }  from '../network.js';

export function buildSternGerlachExperiment(scene, shadow, roomKey = 'datacenter') {
  const meshes = [];
  const D  = BUILDING[roomKey] || BUILDING.datacenter;
  const cx = D.center[0];
  const cz = D.center[2];

  const benchY = 1.0;
  const eyeY   = benchY + 0.50;   // beam axis height - raised for clean geometry

  const hits  = { up: 0, down: 0 };
  const state = { taskComplete: false, firing: false };

  // ── material helpers ──────────────────────────────────────────
  const pbr = (name, r, g, b, metal = 0.8, rough = 0.30) => {
    const m = new BABYLON.PBRMaterial(name, scene);
    m.albedoColor = new BABYLON.Color3(r, g, b);
    m.metallic = metal; m.roughness = rough;
    return m;
  };
  const std = (name, r, g, b, alpha = 1) => {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.emissiveColor = new BABYLON.Color3(r, g, b);
    m.disableLighting = true;
    m.alpha = alpha;
    m.backFaceCulling = false;
    return m;
  };

  // ── palette ───────────────────────────────────────────────────
  const matBench   = pbr('sg_bench',    0.10, 0.10, 0.12, 0.90, 0.20);
  const matSteel   = pbr('sg_steel',    0.20, 0.20, 0.22, 0.85, 0.30);
  const matOven    = pbr('sg_oven',     0.26, 0.16, 0.08, 0.65, 0.50);
  const matHeat    = std('sg_heat',     1.00, 0.45, 0.00);
  const matMagN    = pbr('sg_magN',     0.90, 0.06, 0.04, 0.45, 0.45);
  const matMagS    = pbr('sg_magS',     0.04, 0.14, 0.88, 0.45, 0.45);
  const matYoke    = pbr('sg_yoke',     0.12, 0.12, 0.14, 0.90, 0.25);
  const matField   = std('sg_field',    0.30, 0.65, 1.00, 0.15);
  const matScrFr   = pbr('sg_scr_fr',   0.08, 0.08, 0.10, 0.85, 0.30);
  const matScrFace = pbr('sg_scr_face', 0.96, 0.95, 0.90, 0.00, 0.85);
  const matAtom    = std('sg_atom',     1.00, 0.82, 0.08);  // orange-yellow
  const matTrim    = std('sg_trim',     0.15, 0.45, 0.85);

  // ── bench ─────────────────────────────────────────────────────
  const bench = BABYLON.MeshBuilder.CreateBox('sg_bench', {
    width: 7.0, height: 0.10, depth: 1.3,
  }, scene);
  bench.position.set(cx, benchY - 0.05, cz);
  bench.material = matBench;
  bench.receiveShadows = true;
  bench.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(bench, true);
  meshes.push(bench);

  // front-edge blue glow strip
  const trim = BABYLON.MeshBuilder.CreateBox('sg_trim', {
    width: 7.0, height: 0.014, depth: 0.018,
  }, scene);
  trim.position.set(cx, benchY + 0.001, cz - 0.638);
  trim.material = matTrim;
  trim.checkCollisions = false;
  meshes.push(trim);

  // ── oven (Knudsen cell) ───────────────────────────────────────
  // Horizontal cylinder; orange heating rings; glowing aperture at right end.
  const ovenX   = cx - 2.70;
  const ovenLen = 0.48;
  const ovenR   = 0.13;

  const ovenCyl = BABYLON.MeshBuilder.CreateCylinder('sg_oven_cyl', {
    diameter: ovenR * 2, height: ovenLen, tessellation: 16,
  }, scene);
  ovenCyl.rotation.z = Math.PI / 2;
  ovenCyl.position.set(ovenX, eyeY, cz);
  ovenCyl.material = matOven;
  ovenCyl.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(ovenCyl, true);
  meshes.push(ovenCyl);

  // aperture glow disc (right face)
  const apt = BABYLON.MeshBuilder.CreateCylinder('sg_apt', {
    diameter: 0.08, height: 0.008, tessellation: 12,
  }, scene);
  apt.rotation.z = Math.PI / 2;
  apt.position.set(ovenX + ovenLen / 2 + 0.004, eyeY, cz);
  apt.material = matHeat;
  apt.checkCollisions = false;
  meshes.push(apt);

  // orange heating rings
  [-0.09, +0.09].forEach((dx, i) => {
    const ring = BABYLON.MeshBuilder.CreateTorus(`sg_ring_${i}`, {
      diameter: ovenR * 2 + 0.022, thickness: 0.018, tessellation: 16,
    }, scene);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(ovenX + dx, eyeY, cz);
    ring.material = matHeat;
    ring.checkCollisions = false;
    meshes.push(ring);
  });

  // oven legs
  const legH = eyeY - ovenR - benchY;
  if (legH > 0.01) {
    [-0.10, +0.10].forEach((dz, i) => {
      const leg = BABYLON.MeshBuilder.CreateBox(`sg_leg_${i}`, {
        width: 0.024, height: legH, depth: 0.024,
      }, scene);
      leg.position.set(ovenX, benchY + legH / 2, cz + dz);
      leg.material = matSteel;
      leg.checkCollisions = false;
      meshes.push(leg);
    });
  }

  // ── collimator slits ──────────────────────────────────────────
  // Two slit pairs colimate the atom beam before it enters the field.
  const SLIT_GAP  = 0.055;
  const SLIT_PLH  = 0.20;
  const SLIT_W    = 0.055;
  const SLIT_D    = 0.50;

  const slitXs = [ovenX + ovenLen / 2 + 0.28, ovenX + ovenLen / 2 + 0.64];

  // thin pipe from oven aperture to first slit
  const pipe1Len = slitXs[0] - (ovenX + ovenLen / 2) - SLIT_W / 2;
  if (pipe1Len > 0) {
    const p = BABYLON.MeshBuilder.CreateCylinder('sg_pipe1', {
      diameter: 0.020, height: pipe1Len, tessellation: 8,
    }, scene);
    p.rotation.z = Math.PI / 2;
    p.position.set(ovenX + ovenLen / 2 + pipe1Len / 2, eyeY, cz);
    p.material = matSteel; p.checkCollisions = false;
    meshes.push(p);
  }

  // pipe between the two slit pairs
  const pipe2Len = slitXs[1] - slitXs[0] - SLIT_W;
  if (pipe2Len > 0) {
    const p = BABYLON.MeshBuilder.CreateCylinder('sg_pipe2', {
      diameter: 0.020, height: pipe2Len, tessellation: 8,
    }, scene);
    p.rotation.z = Math.PI / 2;
    p.position.set(slitXs[0] + SLIT_W / 2 + pipe2Len / 2, eyeY, cz);
    p.material = matSteel; p.checkCollisions = false;
    meshes.push(p);
  }

  // build each slit pair (top plate + bottom plate + stand)
  slitXs.forEach((sx, si) => {
    [[+1, 'top'], [-1, 'bot']].forEach(([sign, tag]) => {
      const plate = BABYLON.MeshBuilder.CreateBox(`sg_slit${si}_${tag}`, {
        width: SLIT_W, height: SLIT_PLH, depth: SLIT_D,
      }, scene);
      plate.position.set(sx, eyeY + sign * (SLIT_GAP / 2 + SLIT_PLH / 2), cz);
      plate.material = matSteel;
      plate.checkCollisions = false;
      if (shadow) shadow.addShadowCaster(plate, true);
      meshes.push(plate);
    });
    const stH = Math.max(0.01, eyeY - SLIT_GAP / 2 - SLIT_PLH - benchY);
    const st = BABYLON.MeshBuilder.CreateBox(`sg_slit${si}_st`, {
      width: 0.025, height: stH, depth: 0.025,
    }, scene);
    st.position.set(sx, benchY + stH / 2, cz);
    st.material = matSteel; st.checkCollisions = false;
    meshes.push(st);
  });

  // atoms emerge just after the second slit
  const muzzleX = slitXs[1] + SLIT_W / 2 + 0.02;

  // ── inhomogeneous electromagnet ───────────────────────────────
  // N pole (top): wide body + narrow wedge tip into gap  (asymmetric)
  // S pole (bot): flat solid block from bench up to gap face
  const magX   = cx + 0.05;
  const magGap = 0.40;
  const magW   = 0.42;   // X depth (along beam)
  const magD   = 0.88;   // Z width (perpendicular)

  // N pole - upper body
  const nBodyH = 0.36;
  const nBody = BABYLON.MeshBuilder.CreateBox('sg_magN_body', {
    width: magW, height: nBodyH, depth: magD,
  }, scene);
  nBody.position.set(magX, eyeY + magGap / 2 + 0.22 + nBodyH / 2, cz);
  nBody.material = matMagN;
  nBody.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(nBody, true);
  meshes.push(nBody);

  // N pole - wedge tip (narrow in Z, points INTO gap)
  const nTipH = 0.22;
  const nTip = BABYLON.MeshBuilder.CreateBox('sg_magN_tip', {
    width: magW, height: nTipH, depth: magD * 0.26,
  }, scene);
  nTip.position.set(magX, eyeY + magGap / 2 + nTipH / 2, cz);
  nTip.material = matMagN;
  nTip.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(nTip, true);
  meshes.push(nTip);

  // S pole - flat block (bench top to gap bottom face)
  const sPolH = eyeY - magGap / 2 - benchY;
  const magS = BABYLON.MeshBuilder.CreateBox('sg_magS', {
    width: magW, height: sPolH, depth: magD,
  }, scene);
  magS.position.set(magX, benchY + sPolH / 2, cz);
  magS.material = matMagS;
  magS.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(magS, true);
  meshes.push(magS);

  // connecting yoke (right side, full height from bench to N pole top)
  const yokeTop = eyeY + magGap / 2 + nTipH + nBodyH;
  const yokeH   = yokeTop - benchY;
  const yoke = BABYLON.MeshBuilder.CreateBox('sg_yoke', {
    width: 0.14, height: yokeH, depth: 0.14,
  }, scene);
  yoke.position.set(magX + magW / 2 + 0.07, benchY + yokeH / 2, cz);
  yoke.material = matYoke;
  yoke.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(yoke, true);
  meshes.push(yoke);

  // small N / S pole labels
  _poleLabel(scene, 'N', magX - 0.30, eyeY + magGap / 2 + nTipH + nBodyH / 2, cz,
    new BABYLON.Color3(1.0, 0.35, 0.35), meshes);
  _poleLabel(scene, 'S', magX - 0.30, benchY + sPolH / 2, cz,
    new BABYLON.Color3(0.35, 0.55, 1.0), meshes);

  // pulsing blue field region between poles
  const fieldRegion = BABYLON.MeshBuilder.CreateBox('sg_field', {
    width: magW, height: magGap, depth: magD,
  }, scene);
  fieldRegion.position.set(magX, eyeY, cz);
  fieldRegion.material = matField;
  fieldRegion.checkCollisions = false;
  fieldRegion.isPickable = false;
  meshes.push(fieldRegion);

  let fieldPhase = 0;
  const fieldPulse = scene.registerBeforeRender(() => {
    if (fieldRegion.isDisposed()) { scene.unregisterBeforeRender(fieldPulse); return; }
    fieldPhase += 0.04;
    matField.alpha = 0.10 + Math.sin(fieldPhase) * 0.06;
  });

  // ── detector screen ───────────────────────────────────────────
  // Cream detection face on the left (beam) side; dark frame; grey centre line.
  const screenX   = cx + 2.30;
  const screenH   = 1.20;           // height from bench top
  const screenD   = 0.90;
  const screenThk = 0.10;

  const scrFrame = BABYLON.MeshBuilder.CreateBox('sg_scr_frame', {
    width: screenThk + 0.02, height: screenH + 0.10, depth: screenD + 0.10,
  }, scene);
  scrFrame.position.set(screenX, benchY + screenH / 2, cz);
  scrFrame.material = matScrFr;
  scrFrame.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(scrFrame, true);
  meshes.push(scrFrame);

  // cream face (beam-facing side)
  const scrFace = BABYLON.MeshBuilder.CreateBox('sg_scr_face', {
    width: 0.014, height: screenH, depth: screenD,
  }, scene);
  scrFace.position.set(screenX - screenThk / 2 - 0.003, benchY + screenH / 2, cz);
  scrFace.material = matScrFace;
  scrFace.checkCollisions = false;
  meshes.push(scrFace);

  // grey centre line = classical expectation (one smeared band)
  const clMat = std('sg_cl', 0.55, 0.55, 0.55, 0.50);
  const centreLine = BABYLON.MeshBuilder.CreateBox('sg_centre_line', {
    width: 0.015, height: 0.009, depth: screenD - 0.04,
  }, scene);
  centreLine.position.set(screenX - screenThk / 2 - 0.004, eyeY, cz);
  centreLine.material = clMat;
  centreLine.checkCollisions = false;
  centreLine.isPickable = false;
  meshes.push(centreLine);

  // ── wall readout panel ────────────────────────────────────────
  const panelTex = new BABYLON.DynamicTexture('sg_panel_tex',
    { width: 512, height: 320 }, scene, true);
  const panelWallMat = new BABYLON.StandardMaterial('sg_panel_mat', scene);
  panelWallMat.emissiveTexture = panelTex;
  panelWallMat.diffuseTexture  = panelTex;
  panelWallMat.disableLighting = true;

  const panelPlane = BABYLON.MeshBuilder.CreatePlane('sg_panel', {
    width: 1.8, height: 1.1,
  }, scene);
  // Offset in X when placed in the lab so the panel doesn't clash with the
  // whiteboard mounted on the same wall at x=0.
  const panelX = (roomKey === 'lab') ? cx + 4.0 : cx;
  panelPlane.position.set(panelX, 2.15, D.center[2] - D.size[2] / 2 + 0.05);
  panelPlane.material = panelWallMat;
  panelPlane.checkCollisions = false;
  meshes.push(panelPlane);

  _updatePanel(panelTex, hits, false);

  // ── INFO BOARD — right wall ─────────────────────────────────────
  const infoBoardX = D.center[0] + D.size[0] / 2 - 0.12;  // right wall
  const infoBoardY = 2.30;
  const infoBoardZ = cz - 1.2;

  const infoW  = 2.60;
  const infoH  = 1.70;
  const infoTW = 700;
  const infoTH = 450;

  // Dark backing frame
  const infoFrame = BABYLON.MeshBuilder.CreateBox('sg_info_frame', {
    width: infoW + 0.10,
    height: infoH + 0.10,
    depth: 0.04,
  }, scene);
  infoFrame.position.set(infoBoardX + 0.025, infoBoardY, infoBoardZ);
  infoFrame.rotation.y = -Math.PI / 2;
  infoFrame.material = pbr('sg_info_fr', 0.06, 0.08, 0.14, 0.80, 0.35);
  infoFrame.checkCollisions = false;
  meshes.push(infoFrame);

  // Cyan accent strip
  const infoAccent = BABYLON.MeshBuilder.CreateBox('sg_info_accent', {
    width: infoW + 0.10,
    height: 0.020,
    depth: 0.050,
  }, scene);
  infoAccent.position.set(
    infoBoardX + 0.03,
    infoBoardY + infoH / 2 + 0.06,
    infoBoardZ
  );
  infoAccent.rotation.y = -Math.PI / 2;
  infoAccent.material = std('sg_ia', 0.0, 0.75, 1.0);
  infoAccent.checkCollisions = false;
  meshes.push(infoAccent);

  // Info texture
  const infoTex = new BABYLON.DynamicTexture('sg_info_tex', {
    width: infoTW,
    height: infoTH,
  }, scene, true);

  try { _drawInfoBoard(infoTex, infoTW, infoTH); }
  catch (e) { console.warn('[stern-gerlach] info board draw failed:', e); }

  const infoMat = new BABYLON.StandardMaterial('sg_info_mat', scene);
  infoMat.emissiveTexture = infoTex;
  infoMat.diffuseTexture  = infoTex;
  infoMat.disableLighting = true;
  infoMat.backFaceCulling = false;

  // Info plane
  const infoPlane = BABYLON.MeshBuilder.CreatePlane('sg_info_plane', {
    width: infoW,
    height: infoH,
  }, scene);
  infoPlane.position.set(infoBoardX, infoBoardY, infoBoardZ);
  infoPlane.rotation.y = Math.PI / 2;
  infoPlane.material = infoMat;
  infoPlane.checkCollisions = false;
  meshes.push(infoPlane);

  // Shared dot materials — created once, reused for every hit dot (no GC churn)
  const matDotUp   = std('sg_dot_up',   1.0, 0.22, 0.04);
  const matDotDown = std('sg_dot_down', 0.10, 0.38, 1.00);

  // ── button shared setup ───────────────────────────────────────
  // Buttons sit on the player-facing edge of the bench (cz + 0.50).
  const btnZ      = cz + 0.50;
  const btnBaseY  = benchY;          // base sits on bench surface
  const btnBodyY  = benchY + 0.055;  // button body sits on the base

  const matBtnBase = pbr('sg_btn_base', 0.12, 0.12, 0.14, 0.90, 0.25);

  // ── FIRE button ───────────────────────────────────────────────
  // Dark metallic base plate
  const fireBase = BABYLON.MeshBuilder.CreateBox('sg_fire_base', {
    width: 0.46, height: 0.05, depth: 0.12,
  }, scene);
  fireBase.position.set(cx - 0.30, btnBaseY + 0.025, btnZ);
  fireBase.material = matBtnBase;
  fireBase.checkCollisions = false;
  meshes.push(fireBase);

  // Orange glow strip on the base (front lip)
  const fireGlow = BABYLON.MeshBuilder.CreateBox('sg_fire_glow', {
    width: 0.44, height: 0.006, depth: 0.008,
  }, scene);
  fireGlow.position.set(cx - 0.30, btnBaseY + 0.050, btnZ + 0.056);
  fireGlow.material = std('sg_fg', 1.0, 0.45, 0.0);
  fireGlow.checkCollisions = false;
  meshes.push(fireGlow);

  const fireTex = new BABYLON.DynamicTexture('sg_fire_tex',
    { width: 256, height: 80 }, scene, true);
  _drawFireButton(fireTex, false);

  const fireBtnMat = new BABYLON.StandardMaterial('sg_fire_mat', scene);
  fireBtnMat.emissiveTexture = fireTex;
  fireBtnMat.diffuseTexture  = fireTex;
  fireBtnMat.disableLighting = true;

  const fireBtn = BABYLON.MeshBuilder.CreateBox('sg_fire_btn', {
    width: 0.40, height: 0.18, depth: 0.065,
  }, scene);
  fireBtn.position.set(cx - 0.30, btnBodyY + 0.09, btnZ);
  fireBtn.rotation.x = -0.18;
  fireBtn.rotation.y = Math.PI;  // flip to face player
  fireBtn.material = fireBtnMat;
  fireBtn.isPickable = true;
  fireBtn.checkCollisions = false;
  meshes.push(fireBtn);

  // ── RESET button ──────────────────────────────────────────────
  const resetBase = BABYLON.MeshBuilder.CreateBox('sg_reset_base', {
    width: 0.40, height: 0.05, depth: 0.12,
  }, scene);
  resetBase.position.set(cx + 0.24, btnBaseY + 0.025, btnZ);
  resetBase.material = matBtnBase;
  resetBase.checkCollisions = false;
  meshes.push(resetBase);

  const resetGlow = BABYLON.MeshBuilder.CreateBox('sg_reset_glow', {
    width: 0.38, height: 0.006, depth: 0.008,
  }, scene);
  resetGlow.position.set(cx + 0.24, btnBaseY + 0.050, btnZ + 0.056);
  resetGlow.material = std('sg_rg', 0.0, 0.85, 0.35);
  resetGlow.checkCollisions = false;
  meshes.push(resetGlow);

  const resetTex = new BABYLON.DynamicTexture('sg_reset_tex',
    { width: 256, height: 80 }, scene, true);
  _drawResetButton(resetTex, false);

  const resetBtnMat = new BABYLON.StandardMaterial('sg_reset_mat', scene);
  resetBtnMat.emissiveTexture = resetTex;
  resetBtnMat.diffuseTexture  = resetTex;
  resetBtnMat.disableLighting = true;

  const resetBtn = BABYLON.MeshBuilder.CreateBox('sg_reset_btn', {
    width: 0.34, height: 0.16, depth: 0.065,
  }, scene);
  resetBtn.position.set(cx + 0.24, btnBodyY + 0.08, btnZ);
  resetBtn.rotation.x = -0.18;
  resetBtn.rotation.y = Math.PI;  // flip to face player
  resetBtn.material = resetBtnMat;
  resetBtn.isPickable = true;
  resetBtn.checkCollisions = false;
  meshes.push(resetBtn);

  // ── multiplayer helpers ───────────────────────────────────────
  function _doFire(spinUp) {
    if (state.firing) return false;
    state.firing = true;
    _drawFireButton(fireTex, true);
    try {
      _fireAtom(
        scene, muzzleX, eyeY, cz,
        magX, magW, screenX, screenThk,
        hits, panelTex, meshes, state, matAtom,
        matDotUp, matDotDown,
        () => { state.firing = false; _drawFireButton(fireTex, false); },
        spinUp
      );
      return true;
    } catch (e) {
      console.error('[stern-gerlach] fire error:', e);
      state.firing = false;
      _drawFireButton(fireTex, false);
      return false;
    }
  }

  function _doReset() {
    for (let i = meshes.length - 1; i >= 0; i--) {
      const m = meshes[i];
      if (!m || m.isDisposed() || (m.name && m.name.includes('_hit_'))) {
        if (m && !m.isDisposed()) m.dispose();
        meshes.splice(i, 1);
      }
    }
    hits.up = 0; hits.down = 0;
    state.taskComplete = false;
    state.firing = false;
    _drawFireButton(fireTex, false);
    _updatePanel(panelTex, hits, false);
    _drawResetButton(resetTex, false);
    console.log('[stern-gerlach] reset');
  }

  let _sgNetSetup = false;
  function _setupSGNetwork() {
    if (_sgNetSetup) return;
    const room = getRoom();
    if (!room) return;
    if (!room.state) return;
    if (!room.state.players) return;
    room.onMessage("sg_fire",  ({ spinUp }) => _doFire(spinUp));
    room.onMessage("sg_reset", ()            => _doReset());
    _sgNetSetup = true;
    console.log('[stern-gerlach] multiplayer sync ready');
  }

  let _sgWarned = false;
  const _sgObserver = scene.onBeforeRenderObservable.add(() => {
    try {
      _setupSGNetwork();
      if (_sgNetSetup) scene.onBeforeRenderObservable.remove(_sgObserver);
    } catch (e) {
      if (!_sgWarned) {
        console.warn('[stern-gerlach] waiting for multiplayer room:', e.message);
        _sgWarned = true;
      }
    }
  });

  // ── actions ───────────────────────────────────────────────────
  fireBtn.actionManager = new BABYLON.ActionManager(scene);
  fireBtn.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
    BABYLON.ActionManager.OnPickTrigger,
    () => {
      const spinUp = Math.random() < 0.5;
      const fired = _doFire(spinUp);
      if (!fired) return;
      _setupSGNetwork();
      const room = getRoom();
      if (room) room.send("sg_fire", { spinUp });
    }
  ));

  resetBtn.actionManager = new BABYLON.ActionManager(scene);
  resetBtn.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
    BABYLON.ActionManager.OnPickTrigger,
    () => {
      _doReset();
      _setupSGNetwork();
      const room = getRoom();
      if (room) room.send("sg_reset", {});
    }
  ));

  console.log('[stern-gerlach] experiment built');
  return { meshes };
}

// ════════════════════════════════════════════════════════════════
// FIRE ATOM
//   Phase 1: muzzle -> field exit   (straight, orange sphere)
//   Phase 2: field exit -> screen   (deflected by quantum spin)
// ════════════════════════════════════════════════════════════════
function _fireAtom(scene, muzzleX, eyeY, cz, magX, magW, screenX, screenThk,
  hits, panelTex, meshes, state, atomMat, matDotUp, matDotDown, onDone, forcedSpinUp = undefined) {

  const spinUp  = (forcedSpinUp !== undefined) ? forcedSpinUp : (Math.random() < 0.5);
  const deflect = spinUp ? 0.28 : -0.28;

  // Fewer segments = cheaper GPU; no shadow caster = no shadow-map overhead
  const ball = BABYLON.MeshBuilder.CreateSphere(`sg_shot_${Date.now()}`, {
    diameter: 0.09, segments: 6,
  }, scene);
  ball.position.set(muzzleX, eyeY, cz);
  ball.material = atomMat;
  ball.isPickable = false;
  ball.checkCollisions = false;
  meshes.push(ball);

  const phase1Target = new BABYLON.Vector3(magX + magW * 0.55, eyeY, cz);
  const phase2Target = new BABYLON.Vector3(
    screenX - screenThk / 2 - 0.01, eyeY + deflect, cz
  );

  // Reuse a single temp vector per frame to avoid per-frame allocations
  const _dir = new BABYLON.Vector3();
  let phase = 1;
  const speed = 0.055;

  const obs = scene.registerBeforeRender(() => {
    if (ball.isDisposed()) { scene.unregisterBeforeRender(obs); return; }

    const target = phase === 1 ? phase1Target : phase2Target;
    target.subtractToRef(ball.position, _dir);
    const dist = _dir.length();

    if (dist < 0.05) {
      if (phase === 1) {
        phase = 2;
      } else {
        scene.unregisterBeforeRender(obs);

        if (spinUp) hits.up++; else hits.down++;
        _spawnHitDot(scene, phase2Target.x, eyeY + deflect, cz,
          spinUp ? matDotUp : matDotDown, meshes);

        // Fully dispose the ball and remove from meshes — no lingering memory
        const idx = meshes.indexOf(ball);
        if (idx !== -1) meshes.splice(idx, 1);
        ball.dispose();

        const complete = hits.up >= 3 && hits.down >= 2;
        if (complete) state.taskComplete = true;
        _updatePanel(panelTex, hits, complete);
        onDone();
      }
    } else {
      _dir.scaleInPlace(speed / dist);
      ball.position.addInPlace(_dir);
    }
  });
}

// ════════════════════════════════════════════════════════════════
// HIT DOT — coloured sphere on the detector face
// ════════════════════════════════════════════════════════════════
function _spawnHitDot(scene, x, y, z, mat, meshes) {
  const dot = BABYLON.MeshBuilder.CreateSphere(`sg_atom_hit_${Date.now()}`, {
    diameter: 0.045, segments: 4,   // cheap — just a small marker dot
  }, scene);
  dot.position.set(
    x,
    y  + (Math.random() - 0.5) * 0.05,
    z  + (Math.random() - 0.5) * 0.07
  );
  dot.material = mat;
  dot.isPickable = false;
  dot.checkCollisions = false;
  meshes.push(dot);
}

// ════════════════════════════════════════════════════════════════
// WALL READOUT PANEL
// ════════════════════════════════════════════════════════════════
function _updatePanel(tex, hits, complete) {
  const ctx = tex.getContext();
  ctx.fillStyle = '#000d1a';
  ctx.fillRect(0, 0, 512, 320);

  ctx.fillStyle = '#00deff';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('STERN-GERLACH', 20, 42);
  ctx.fillStyle = '#334';
  ctx.font = '14px monospace';
  ctx.fillText('Silver atom spin-1/2 measurement', 20, 62);

  ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 74); ctx.lineTo(492, 74); ctx.stroke();

  // spin-up bar
  ctx.fillStyle = '#ff5522';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`UP   ${hits.up}`, 20, 106);
  ctx.fillStyle = '#bb2200';
  ctx.fillRect(20, 113, Math.min(hits.up * 44, 472), 18);
  ctx.strokeStyle = '#ff4411'; ctx.lineWidth = 1; ctx.strokeRect(20, 113, 472, 18);

  // spin-down bar
  ctx.fillStyle = '#2299ff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`DOWN ${hits.down}`, 20, 158);
  ctx.fillStyle = '#0033bb';
  ctx.fillRect(20, 165, Math.min(hits.down * 44, 472), 18);
  ctx.strokeStyle = '#1155ff'; ctx.lineWidth = 1; ctx.strokeRect(20, 165, 472, 18);

  const total = hits.up + hits.down;
  ctx.fillStyle = '#778';
  ctx.font = '16px monospace';
  ctx.fillText(`Total: ${total}`, 20, 212);
  if (total > 0) {
    const up = Math.round(hits.up / total * 100);
    const dn = Math.round(hits.down / total * 100);
    ctx.fillText(`Ratio  UP ${up}%   DOWN ${dn}%   (ideal 50/50)`, 20, 234);
  }

  ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 250); ctx.lineTo(492, 250); ctx.stroke();

  if (complete) {
    ctx.fillStyle = '#00ff99';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('TWO-BAND PATTERN CONFIRMED', 20, 278);
    ctx.fillStyle = '#55ffbb';
    ctx.font = '13px monospace';
    ctx.fillText('Spin is quantised -- only two outcomes exist', 20, 298);
    ctx.fillText('Classical prediction (smeared band) is wrong', 20, 315);
  } else {
    ctx.fillStyle = '#334';
    ctx.font = '14px monospace';
    ctx.fillText('Fire >=3 UP and >=2 DOWN atoms to confirm pattern', 20, 278);
  }

  tex.update();
}

// ════════════════════════════════════════════════════════════════
// BUTTON HELPERS
// ════════════════════════════════════════════════════════════════
function _drawFireButton(tex, active) {
  const ctx = tex.getContext();
  const W = 256, H = 80;

  // dark gradient background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   active ? '#3a1200' : '#1e0800');
  bg.addColorStop(0.5, active ? '#260d00' : '#130500');
  bg.addColorStop(1,   active ? '#3a1200' : '#1e0800');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // outer glow border
  ctx.shadowColor = active ? '#ff7700' : '#cc3300';
  ctx.shadowBlur  = active ? 10 : 5;
  ctx.strokeStyle = active ? '#ff9933' : '#cc4400';
  ctx.lineWidth   = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.shadowBlur  = 0;

  // mid border
  ctx.strokeStyle = active ? '#ff5500' : '#882200';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  // inner border
  ctx.strokeStyle = active ? '#ff330088' : '#44110044';
  ctx.lineWidth   = 1;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // corner L-accents
  const cs = 12;
  ctx.strokeStyle = active ? '#ffcc44' : '#ff6600';
  ctx.lineWidth   = 2.5;
  [[2, 2, 1, 1], [W - 2, 2, -1, 1], [2, H - 2, 1, -1], [W - 2, H - 2, -1, -1]]
    .forEach(([ox, oy, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(ox, oy + dy * cs); ctx.lineTo(ox, oy); ctx.lineTo(ox + dx * cs, oy);
      ctx.stroke();
    });

  // glowing text
  ctx.shadowColor   = active ? '#ffaa00' : '#ff5500';
  ctx.shadowBlur    = active ? 18 : 10;
  ctx.fillStyle     = active ? '#fff0bb' : '#ff8833';
  ctx.font          = `bold ${active ? 32 : 30}px monospace`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillText('FIRE', W / 2, H / 2);
  ctx.shadowBlur    = 0;

  tex.update();
}

function _drawResetButton(tex, active) {
  const ctx = tex.getContext();
  const W = 256, H = 80;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   active ? '#002500' : '#001200');
  bg.addColorStop(0.5, active ? '#001800' : '#000c00');
  bg.addColorStop(1,   active ? '#002500' : '#001200');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.shadowColor = active ? '#44ff77' : '#00aa33';
  ctx.shadowBlur  = active ? 10 : 5;
  ctx.strokeStyle = active ? '#55ff88' : '#00cc44';
  ctx.lineWidth   = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.shadowBlur  = 0;

  ctx.strokeStyle = active ? '#22cc44' : '#006622';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  ctx.strokeStyle = active ? '#11442288' : '#00221100';
  ctx.lineWidth   = 1;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  const cs = 12;
  ctx.strokeStyle = active ? '#88ffaa' : '#00ff55';
  ctx.lineWidth   = 2.5;
  [[2, 2, 1, 1], [W - 2, 2, -1, 1], [2, H - 2, 1, -1], [W - 2, H - 2, -1, -1]]
    .forEach(([ox, oy, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(ox, oy + dy * cs); ctx.lineTo(ox, oy); ctx.lineTo(ox + dx * cs, oy);
      ctx.stroke();
    });

  ctx.shadowColor  = active ? '#55ff88' : '#00cc44';
  ctx.shadowBlur   = active ? 16 : 8;
  ctx.fillStyle    = active ? '#ccffdd' : '#00ee55';
  ctx.font         = `bold ${active ? 28 : 26}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RESET', W / 2, H / 2);
  ctx.shadowBlur   = 0;

  tex.update();
}

// ════════════════════════════════════════════════════════════════
// SMALL POLE LABEL (N / S only - no large boards)
// ════════════════════════════════════════════════════════════════
function _poleLabel(scene, letter, x, y, z, color, meshes) {
  const tex = new BABYLON.DynamicTexture(`sg_pole_lbl_${letter}_${x}`,
    { width: 64, height: 64 }, scene, true);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 32, 34);
  tex.update();

  const mat = new BABYLON.StandardMaterial(`sg_pole_mat_${letter}_${x}`, scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  if (mat.diffuseTexture) mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;

  const plane = BABYLON.MeshBuilder.CreatePlane(`sg_pole_plane_${letter}_${x}`, {
    width: 0.18, height: 0.18,
  }, scene);
  plane.position.set(x, y, z);
  plane.billboardMode  = BABYLON.Mesh.BILLBOARDMODE_Y;
  plane.material       = mat;
  plane.checkCollisions = false;
  meshes.push(plane);
}

// ════════════════════════════════════════════════════════════════
// INFO BOARD — drawn once, mounted on the wall
// ════════════════════════════════════════════════════════════════
function _drawInfoBoard(tex, W, H) {
  const ctx = tex.getContext();

  // ── background ────────────────────────────────────────────────
  ctx.fillStyle = '#07091a';
  ctx.fillRect(0, 0, W, H);

  // top colour bar
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0,   '#0055aa');
  topBar.addColorStop(0.5, '#00aaff');
  topBar.addColorStop(1,   '#0055aa');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 8);

  // outer border
  ctx.strokeStyle = '#1a3a6a';
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 10, W - 10, H - 15);

  // ── title ─────────────────────────────────────────────────────
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STERN–GERLACH EXPERIMENT', W / 2, 50);

  ctx.fillStyle = '#6688aa';
  ctx.font = '14px monospace';
  ctx.fillText('Frankfurt, 1922  |  Otto Stern  &  Walther Gerlach', W / 2, 72);

  // divider
  ctx.strokeStyle = '#1a3a6a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 84); ctx.lineTo(W - 20, 84); ctx.stroke();

  // ── setup diagram (text art) ───────────────────────────────────
  ctx.fillStyle = '#3a5a8a';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('APPARATUS', 24, 104);

  const diagramY = 126;
  ctx.font = '13px monospace';

  // beam line
  ctx.strokeStyle = '#ff9900';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(130, diagramY); ctx.lineTo(W - 30, diagramY); ctx.stroke();
  ctx.setLineDash([]);

  // deflected paths
  ctx.strokeStyle = '#ff4422';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(430, diagramY); ctx.lineTo(W - 30, diagramY - 22); ctx.stroke();
  ctx.strokeStyle = '#2255ff';
  ctx.beginPath(); ctx.moveTo(430, diagramY); ctx.lineTo(W - 30, diagramY + 22); ctx.stroke();

  // component boxes
  const boxes = [
    [20,  diagramY - 18, 90, 36,  '#aa6622', 'OVEN'],
    [140, diagramY - 20, 60, 40,  '#334466', 'SLITS'],
    [220, diagramY - 30, 80, 60,  '#8a1a1a', 'N'],
    [220, diagramY,      80, 30,  '#1a1a8a', 'S'],
    [W - 30, diagramY - 36, 14, 72, '#445533', ''],
  ];
  boxes.forEach(([bx, by, bw, bh, col, label]) => {
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, bw, bh);
    if (label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + bw / 2, by + bh / 2 + 4);
    }
  });
  // screen label
  ctx.fillStyle = '#aabb99';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Screen', W - 23, diagramY - 42);

  // spin-up / spin-down labels on diagram
  ctx.fillStyle = '#ff4422';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('spin +½', W - 28 - 54, diagramY - 36);
  ctx.fillStyle = '#2255ff';
  ctx.fillText('spin -½', W - 28 - 54, diagramY + 38);

  // ── divider ───────────────────────────────────────────────────
  ctx.strokeStyle = '#1a3a6a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 170); ctx.lineTo(W - 20, 170); ctx.stroke();

  // ── two-column body ───────────────────────────────────────────
  const col1X = 24, col2X = W / 2 + 10, colW = W / 2 - 34;
  let y = 192;

  const header = (text, cx2, cy) => {
    ctx.fillStyle = '#00aadd';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, cx2, cy);
  };
  const body = (lines, cx2, startY) => {
    ctx.fillStyle = '#8899bb';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, cx2, startY + i * 17));
  };
  const wrap = (text, cx2, cy, maxW) => {
    const words = text.split(' ');
    let line = '', ly = cy;
    ctx.fillStyle = '#8899bb';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    for (const w of words) {
      const test = line + (line ? ' ' : '') + w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx2, ly);
        line = w; ly += 16;
      } else { line = test; }
    }
    if (line) ctx.fillText(line, cx2, ly);
    return ly + 16;
  };

  // Left column — How it works
  header('HOW IT WORKS', col1X, y);
  y += 18;
  y = wrap('Silver atoms are heated in a Knudsen cell until they vaporise and escape as a beam.', col1X, y, colW);
  y = wrap('Two collimator slits narrow the beam so atoms travel in a straight line.', col1X, y, colW);
  y = wrap('An inhomogeneous magnetic field exerts a force on each atom proportional to its magnetic moment (spin).', col1X, y, colW);

  // Right column — Quantum result
  let ry = 192;
  header('QUANTUM RESULT', col2X, ry);
  ry += 20;
  ctx.fillStyle = '#cc3300';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('▲  Spin-Up   ms = +1/2', col2X, ry);
  ry += 18;
  ctx.fillStyle = '#2244cc';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('▼  Spin-Down ms = -1/2', col2X, ry);
  ry += 22;
  ry = wrap('Classical physics predicts a continuous smear. Quantum mechanics predicts — and experiment confirms — exactly TWO discrete bands.', col2X, ry, colW);
  ry += 4;
  header('SIGNIFICANCE', col2X, ry);
  ry += 18;
  ry = wrap('First direct proof that electron spin is spatially quantised. Only two spin states exist in nature.', col2X, ry, colW);

  // vertical divider between columns
  ctx.strokeStyle = '#1a3a6a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, 178); ctx.lineTo(W / 2, H - 20);
  ctx.stroke();

  // ── bottom divider + Nobel note ───────────────────────────────
  ctx.strokeStyle = '#1a3a6a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, H - 28); ctx.lineTo(W - 20, H - 28); ctx.stroke();

  ctx.fillStyle = '#c8a800';
  ctx.font = 'italic 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Nobel Prize in Physics 1943 awarded to Otto Stern for this discovery', W / 2, H - 10);

  tex.update();
}
