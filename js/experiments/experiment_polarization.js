// js/experiments/polarization.js
// Malus's Law — Polarization Experiment
//
// Layout (inside datacenter room, center [22, 0, 0]):
//
//   [LAMP] ──beam──► [POLARIZER 1 fixed] ──beam──► [POLARIZER 2 grab+rotate] ──beam──► [SCREEN]
//
// Physics:
//   I = I₀ × cos²(θ)
//   θ = angle between the two polarizer transmission axes
//
// Player interaction:
//   - Grab Polarizer 2 with VR controller and rotate it
//   - Beam and screen brightness update in real time
//   - Angle readout panel shows current θ and calculated intensity
//   - Task: find the angle that produces minimum intensity (θ = 90°)
//
// Returns { meshes } for roomManager registration.

import { BUILDING } from '../building.js';
import { makePickable } from '../pickup.js';
import {
  requestGrab, sendTransform, releaseObject,
  getMySessionId, getRoom, onObjectChange,
  onGrabAccepted, onGrabRejected,
} from '../network.js';

export function buildPolarizationExperiment(scene, shadow) {
  const meshes = [];
  const D      = BUILDING.datacenter;
  const cx     = D.center[0]; // 22
  const cy     = D.center[1]; // 0
  const cz     = D.center[2]; // 0

  // ── Experiment bench height ───────────────────────────────────────
  const benchY  = 1.0;  // table surface height
  const eyeY    = benchY + 0.15; // centre of components at eye-friendly height

  // ── X positions along the optical axis (left → right) ────────────
  const lampX   = cx - 4.0;
  const pol1X   = cx - 1.5;
  const pol2X   = cx + 1.0;
  const screenX = cx + 3.5;
  const axisZ   = cz - 2.0; // slightly toward back wall

  // ═══════════════════════════════════════════════════════════════════
  // MATERIALS
  // ═══════════════════════════════════════════════════════════════════

  // Lamp housing
  const lampMat = new BABYLON.PBRMaterial('pol_lamp_mat', scene);
  lampMat.albedoColor = new BABYLON.Color3(0.15, 0.15, 0.18);
  lampMat.metallic    = 0.6;
  lampMat.roughness   = 0.4;

  // Lamp glow — white polarized light source
  const lampGlowMat = new BABYLON.PBRMaterial('pol_lampglow_mat', scene);
  lampGlowMat.albedoColor       = new BABYLON.Color3(1, 1, 0.92);
  lampGlowMat.emissiveColor     = new BABYLON.Color3(1, 1, 0.92);
  lampGlowMat.emissiveIntensity = 3.0;

  // Polarizer disc material (tinted glass-like)
  const polMat = new BABYLON.PBRMaterial('pol_disc_mat', scene);
  polMat.albedoColor = new BABYLON.Color3(0.2, 0.5, 0.9);
  polMat.alpha       = 0.55;
  polMat.metallic    = 0.0;
  polMat.roughness   = 0.1;
  polMat.backFaceCulling = false;

  // Polarizer 2 — slightly different tint so player can distinguish
  const pol2Mat = new BABYLON.PBRMaterial('pol2_disc_mat', scene);
  pol2Mat.albedoColor = new BABYLON.Color3(0.9, 0.4, 0.1);
  pol2Mat.alpha       = 0.55;
  pol2Mat.metallic    = 0.0;
  pol2Mat.roughness   = 0.1;
  pol2Mat.backFaceCulling = false;

  // Polarizer frame (ring)
  const frameMat = new BABYLON.PBRMaterial('pol_frame_mat', scene);
  frameMat.albedoColor = new BABYLON.Color3(0.25, 0.25, 0.28);
  frameMat.metallic    = 0.8;
  frameMat.roughness   = 0.3;

  // Beam material — updated dynamically
  const beamMat1 = new BABYLON.PBRMaterial('pol_beam1_mat', scene);
  beamMat1.albedoColor       = new BABYLON.Color3(1, 1, 0.85);
  beamMat1.emissiveColor     = new BABYLON.Color3(1, 1, 0.85);
  beamMat1.emissiveIntensity = 1.5;
  beamMat1.alpha             = 0.6;

  const beamMat2 = new BABYLON.PBRMaterial('pol_beam2_mat', scene);
  beamMat2.albedoColor       = new BABYLON.Color3(1, 1, 0.85);
  beamMat2.emissiveColor     = new BABYLON.Color3(1, 1, 0.85);
  beamMat2.emissiveIntensity = 1.5;
  beamMat2.alpha             = 0.6;

  // Screen material — updated dynamically
  const screenMat = new BABYLON.PBRMaterial('pol_screen_mat', scene);
  screenMat.albedoColor       = new BABYLON.Color3(1, 1, 0.85);
  screenMat.emissiveColor     = new BABYLON.Color3(1, 1, 0.85);
  screenMat.emissiveIntensity = 2.5;

  // Stand material
  const standMat = new BABYLON.PBRMaterial('pol_stand_mat', scene);
  standMat.albedoColor = new BABYLON.Color3(0.3, 0.3, 0.32);
  standMat.metallic    = 0.7;
  standMat.roughness   = 0.4;

  // ═══════════════════════════════════════════════════════════════════
  // OPTICAL BENCH (base table)
  // ═══════════════════════════════════════════════════════════════════
  const bench = BABYLON.MeshBuilder.CreateBox('pol_bench', {
    width: 10, height: 0.08, depth: 0.9,
  }, scene);
  bench.position.set(cx - 0.25, benchY - 0.04, axisZ);
  bench.material        = standMat;
  bench.checkCollisions = false;
  bench.receiveShadows  = true;
  if (shadow) shadow.addShadowCaster(bench, true);
  meshes.push(bench);

  // Bench legs
  [cx - 4.5, cx + 4.0].forEach((x, i) => {
    const leg = BABYLON.MeshBuilder.CreateBox(`pol_leg_${i}`, {
      width: 0.06, height: benchY - 0.04, depth: 0.06,
    }, scene);
    leg.position.set(x, (benchY - 0.04) / 2, axisZ);
    leg.material        = standMat;
    leg.checkCollisions = false;
    meshes.push(leg);
  });

  // ═══════════════════════════════════════════════════════════════════
  // LAMP (light source)
  // ═══════════════════════════════════════════════════════════════════
  // Housing
  const lamp = BABYLON.MeshBuilder.CreateBox('pol_lamp', {
    width: 0.22, height: 0.22, depth: 0.22,
  }, scene);
  lamp.position.set(lampX, eyeY, axisZ);
  lamp.material        = lampMat;
  lamp.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(lamp, true);
  meshes.push(lamp);

  // Emissive face (front of lamp)
  const lampFace = BABYLON.MeshBuilder.CreateDisc('pol_lampface', {
    radius: 0.07, tessellation: 32,
  }, scene);
  lampFace.position.set(lampX + 0.12, eyeY, axisZ);
  lampFace.rotation.y  = Math.PI / 2;
  lampFace.material    = lampGlowMat;
  lampFace.checkCollisions = false;
  meshes.push(lampFace);

  // Stand post for lamp
  const lampPost = BABYLON.MeshBuilder.CreateCylinder('pol_lamp_post', {
    diameter: 0.04, height: benchY + 0.11 - 0.04, tessellation: 12,
  }, scene);
  lampPost.position.set(lampX, (benchY + 0.11 - 0.04) / 2, axisZ);
  lampPost.material        = standMat;
  lampPost.checkCollisions = false;
  meshes.push(lampPost);

  // Label
  _makeLabel(scene, 'LIGHT\nSOURCE', lampX, eyeY + 0.22, axisZ, meshes);

  // ═══════════════════════════════════════════════════════════════════
  // POLARIZER 1 — fixed (blue)
  // ═══════════════════════════════════════════════════════════════════
  const pol1Root = new BABYLON.TransformNode('pol1_root', scene);
  pol1Root.position.set(pol1X, eyeY, axisZ);
  meshes.push(pol1Root);

  const pol1Disc = BABYLON.MeshBuilder.CreateDisc('pol1_disc', {
    radius: 0.18, tessellation: 48,
  }, scene);
  pol1Disc.parent   = pol1Root;
  pol1Disc.rotation.y = Math.PI / 2;
  pol1Disc.material   = polMat;
  pol1Disc.checkCollisions = false;
  meshes.push(pol1Disc);

  // Frame ring
  const pol1Ring = BABYLON.MeshBuilder.CreateTorus('pol1_ring', {
    diameter: 0.38, thickness: 0.025, tessellation: 48,
  }, scene);
  pol1Ring.parent   = pol1Root;
  pol1Ring.rotation.y = Math.PI / 2;
  pol1Ring.material   = frameMat;
  pol1Ring.checkCollisions = false;
  meshes.push(pol1Ring);

  // Transmission axis indicator (line on disc)
  const pol1Axis = BABYLON.MeshBuilder.CreateBox('pol1_axis', {
    width: 0.008, height: 0.32, depth: 0.012,
  }, scene);
  pol1Axis.parent   = pol1Root;
  pol1Axis.rotation.y = Math.PI / 2;
  pol1Axis.material   = lampGlowMat; // bright white line
  pol1Axis.checkCollisions = false;
  meshes.push(pol1Axis);

  // Stand
  const pol1Post = BABYLON.MeshBuilder.CreateCylinder('pol1_post', {
    diameter: 0.035, height: eyeY - benchY + 0.04, tessellation: 12,
  }, scene);
  pol1Post.position.set(pol1X, benchY + (eyeY - benchY) / 2, axisZ);
  pol1Post.material        = standMat;
  pol1Post.checkCollisions = false;
  meshes.push(pol1Post);

  _makeLabel(scene, 'POLARIZER 1\n(fixed)', pol1X, eyeY + 0.28, axisZ, meshes);

  // ═══════════════════════════════════════════════════════════════════
  // POLARIZER 2 — grabbable (orange) — this is what the student rotates
  // ═══════════════════════════════════════════════════════════════════
  const pol2Root = new BABYLON.TransformNode('pol2_root', scene);
  pol2Root.position.set(pol2X, eyeY, axisZ);
  meshes.push(pol2Root);

  const pol2Disc = BABYLON.MeshBuilder.CreateDisc('pol2_disc', {
    radius: 0.18, tessellation: 48,
  }, scene);
  pol2Disc.parent   = pol2Root;
  pol2Disc.rotation.y = Math.PI / 2;
  pol2Disc.material   = pol2Mat;
  pol2Disc.checkCollisions = false;
  meshes.push(pol2Disc);

  const pol2Ring = BABYLON.MeshBuilder.CreateTorus('pol2_ring', {
    diameter: 0.38, thickness: 0.025, tessellation: 48,
  }, scene);
  pol2Ring.parent   = pol2Root;
  pol2Ring.rotation.y = Math.PI / 2;
  pol2Ring.material   = frameMat;
  pol2Ring.checkCollisions = false;
  meshes.push(pol2Ring);

  // Transmission axis indicator
  const pol2Axis = BABYLON.MeshBuilder.CreateBox('pol2_axis', {
    width: 0.008, height: 0.32, depth: 0.012,
  }, scene);
  pol2Axis.parent   = pol2Root;
  pol2Axis.rotation.y = Math.PI / 2;
  pol2Axis.material   = lampGlowMat;
  pol2Axis.checkCollisions = false;
  meshes.push(pol2Axis);

  // Stand (shorter — pol2 sits on a sliding mount)
  const pol2Post = BABYLON.MeshBuilder.CreateCylinder('pol2_post', {
    diameter: 0.035, height: eyeY - benchY + 0.04, tessellation: 12,
  }, scene);
  pol2Post.position.set(pol2X, benchY + (eyeY - benchY) / 2, axisZ);
  pol2Post.material        = standMat;
  pol2Post.checkCollisions = false;
  meshes.push(pol2Post);

  _makeLabel(scene, 'POLARIZER 2\n(GRAB + ROTATE)', pol2X, eyeY + 0.28, axisZ, meshes);

  // ── Network state for ownership ──────────────────────────────────
  let dragPending   = false;
  let isGrabbed     = false;
  let _netSetup     = false;
  let _lastNetSend  = 0;
  let _lastAngleDeg = 0;
  let _savedPos     = pol2Root.position.clone();
  let _savedRot     = pol2Root.rotation.clone();

  // ── Visual ownership feedback ─────────────────────────────────────
  let _hl           = null;
  let _hlMode       = null;
  let _heldLabel    = null;
  let _labelOwnerId = null;

  const _POL_MESHES  = [pol2Disc, pol2Ring, pol2Axis].filter(Boolean);
  const _COLOR_MINE  = new BABYLON.Color3(0.2, 1.0, 0.3);
  const _COLOR_OTHER = new BABYLON.Color3(0.2, 0.5, 1.0);

  function _getHL() {
    if (!_hl) {
      _hl = new BABYLON.HighlightLayer('pol_hl', scene);
      _hl.innerGlow = false;
      _hl.outerGlow = true;
    }
    return _hl;
  }

  function _setHL(mode, color) {
    if (_hlMode === mode) return;
    _hlMode = mode;
    const hl = _getHL();
    _POL_MESHES.forEach(m => { hl.removeMesh(m); hl.addMesh(m, color); });
  }

  function _removeHL() {
    if (_hl) _POL_MESHES.forEach(m => _hl.removeMesh(m));
    _hlMode = null;
  }

  function _createLabel(name) {
    _removeLabel();
    const tex = new BABYLON.DynamicTexture('pol_held_tex', { width: 256, height: 64 }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Held by ${name}`, 128, 38);
    tex.update();

    const mat = new BABYLON.StandardMaterial('pol_held_mat', scene);
    mat.emissiveTexture = tex;
    mat.diffuseTexture  = tex;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.diffuseTexture.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;

    const plane = BABYLON.MeshBuilder.CreatePlane('pol_held_label', {
      width: 0.7, height: 0.18,
    }, scene);
    plane.position.set(pol2Root.position.x, pol2Root.position.y + 0.3, pol2Root.position.z);
    plane.billboardMode   = BABYLON.Mesh.BILLBOARDMODE_ALL;
    plane.material        = mat;
    plane.isPickable      = false;
    plane.checkCollisions = false;
    _heldLabel = plane;
  }

  function _removeLabel() {
    if (!_heldLabel) return;
    const mat = _heldLabel.material;
    mat?.getActiveTextures()?.forEach(t => t.dispose());
    mat?.dispose();
    _heldLabel.dispose();
    _heldLabel    = null;
    _labelOwnerId = null;
  }

  // ── Wire up pickup — grab the whole pol2Root node ─────────────────
  makePickable(scene, pol2Root, {
    snapToSurface: false,
    rotateOnDrag:  true,   // SixDofDragBehavior rotates object with controller
    highlight:     true,
    onPickup: () => {
      _savedPos = pol2Root.position.clone();
      _savedRot = pol2Root.rotation.clone();
      _setupNetworkListeners();   // register before requestGrab to avoid missing grabAccepted

      const ok = requestGrab("polarizer");
      if (!ok) {
        console.warn('[polarization] multiplayer not connected; grab not synced');
        return;   // dragPending/isGrabbed stay false — local drag still works
      }

      dragPending = true;
      isGrabbed   = true;
      console.log('[polarization] pol2 grab requested');
    },
    onDrop: () => {
      if (isGrabbed) {
        if (!dragPending) {
          sendTransform("polarizer", pol2Root.position, pol2Root.rotation, _lastAngleDeg);
        }
        releaseObject("polarizer");   // always release even on quick-drop during pending
      }
      dragPending = false;
      isGrabbed   = false;
    },
  });

  function _setupNetworkListeners() {
    if (_netSetup) return;

    const accepted = onGrabAccepted(({ objectId }) => {
      if (objectId !== "polarizer") return;
      dragPending = false;
    });

    const rejected = onGrabRejected(({ objectId }) => {
      if (objectId !== "polarizer") return;
      dragPending = false;
      isGrabbed   = false;
      pol2Root.position.copyFrom(_savedPos);
      pol2Root.rotation.copyFrom(_savedRot);
      console.log('[polarization] Object held by another user');
    });

    const changed = onObjectChange("polarizer", (state) => {
      const myId = getMySessionId();

      if (state.ownerId === myId) {
        _setHL("mine", _COLOR_MINE);
        _removeLabel();
        return;   // I own it — my drag drives the transform
      }

      if (state.ownerId !== "") {
        _setHL("other", _COLOR_OTHER);
        if (state.ownerId !== _labelOwnerId) {
          const owner = getRoom()?.state?.players?.get(state.ownerId);
          const name  = owner?.name ?? "another user";
          _createLabel(name);
          _labelOwnerId = state.ownerId;
        }
        if (_heldLabel) _heldLabel.position.set(state.x, state.y + 0.3, state.z);
      } else {
        _removeHL();
        _removeLabel();
      }

      pol2Root.position.set(state.x, state.y, state.z);
      pol2Root.rotation.set(state.rotX, state.rotY, state.rotZ);
    });

    if (accepted && rejected && changed) _netSetup = true;
  }

  _setupNetworkListeners();   // attempt at build time; succeeds if called after connect()

  // ═══════════════════════════════════════════════════════════════════
  // BEAMS
  // ═══════════════════════════════════════════════════════════════════
  const beam1Len = pol1X - lampX - 0.14;
  const beam1 = BABYLON.MeshBuilder.CreateCylinder('pol_beam1', {
    diameter: 0.035, height: beam1Len, tessellation: 12,
  }, scene);
  beam1.position.set(lampX + 0.14 + beam1Len / 2, eyeY, axisZ);
  beam1.rotation.z  = Math.PI / 2;
  beam1.material    = beamMat1;
  beam1.checkCollisions = false;
  meshes.push(beam1);

  const beam2Len = pol2X - pol1X - 0.2;
  const beam2 = BABYLON.MeshBuilder.CreateCylinder('pol_beam2', {
    diameter: 0.035, height: beam2Len, tessellation: 12,
  }, scene);
  beam2.position.set(pol1X + 0.1 + beam2Len / 2, eyeY, axisZ);
  beam2.rotation.z  = Math.PI / 2;
  beam2.material    = beamMat2;
  beam2.checkCollisions = false;
  meshes.push(beam2);

  const beam3Len = screenX - pol2X - 0.2;
  const beam3 = BABYLON.MeshBuilder.CreateCylinder('pol_beam3', {
    diameter: 0.035, height: beam3Len, tessellation: 12,
  }, scene);
  beam3.position.set(pol2X + 0.1 + beam3Len / 2, eyeY, axisZ);
  beam3.rotation.z  = Math.PI / 2;
  beam3.material    = beamMat2; // same mat — updated with pol2
  beam3.checkCollisions = false;
  meshes.push(beam3);

  // ═══════════════════════════════════════════════════════════════════
  // DETECTOR SCREEN
  // ═══════════════════════════════════════════════════════════════════
  const screenFrame = BABYLON.MeshBuilder.CreateBox('pol_screen_frame', {
    width: 0.05, height: 0.55, depth: 0.55,
  }, scene);
  screenFrame.position.set(screenX, eyeY, axisZ);
  screenFrame.material        = frameMat;
  screenFrame.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(screenFrame, true);
  meshes.push(screenFrame);

  const screenPlane = BABYLON.MeshBuilder.CreatePlane('pol_screen_plane', {
    width: 0.44, height: 0.44,
  }, scene);
  screenPlane.position.set(screenX - 0.03, eyeY, axisZ);
  screenPlane.rotation.y    = -Math.PI / 2;
  screenPlane.material      = screenMat;
  screenPlane.checkCollisions = false;
  meshes.push(screenPlane);

  // Screen stand
  const screenPost = BABYLON.MeshBuilder.CreateCylinder('pol_screen_post', {
    diameter: 0.04, height: eyeY - benchY + 0.04, tessellation: 12,
  }, scene);
  screenPost.position.set(screenX, benchY + (eyeY - benchY) / 2, axisZ);
  screenPost.material        = standMat;
  screenPost.checkCollisions = false;
  meshes.push(screenPost);

  _makeLabel(scene, 'DETECTOR\nSCREEN', screenX, eyeY + 0.36, axisZ, meshes);

  // ═══════════════════════════════════════════════════════════════════
  // READOUT PANEL (on north wall of datacenter)
  // ═══════════════════════════════════════════════════════════════════
  const panelW   = 1.6;
  const panelH   = 1.0;
  const panelTex = new BABYLON.DynamicTexture('pol_panel_tex',
    { width: 512, height: 320 }, scene, true);

  const panelMat = new BABYLON.StandardMaterial('pol_panel_mat', scene);
  panelMat.emissiveTexture  = panelTex;
  panelMat.diffuseTexture   = panelTex;
  panelMat.disableLighting  = true;

  const panel = BABYLON.MeshBuilder.CreatePlane('pol_panel', {
    width: panelW, height: panelH,
  }, scene);
  panel.position.set(cx + 2, 2.0, D.center[2] - D.size[2] / 2 + 0.05);
  panel.rotation.y     = 0; // faces south (toward player)
  panel.material       = panelMat;
  panel.checkCollisions = false;
  meshes.push(panel);

  // Panel frame
  const panelFrame = BABYLON.MeshBuilder.CreateBox('pol_panel_frame', {
    width: panelW + 0.06, height: panelH + 0.06, depth: 0.03,
  }, scene);
  panelFrame.position.set(cx + 2, 2.0, D.center[2] - D.size[2] / 2 + 0.02);
  panelFrame.material        = frameMat;
  panelFrame.checkCollisions = false;
  meshes.push(panelFrame);

  // ═══════════════════════════════════════════════════════════════════
  // TASK INSTRUCTION SIGN (above the experiment bench)
  // ═══════════════════════════════════════════════════════════════════
  const taskTex = new BABYLON.DynamicTexture('pol_task_tex',
    { width: 512, height: 128 }, scene, true);
  const taskCtx = taskTex.getContext();
  taskCtx.fillStyle = '#001133';
  taskCtx.fillRect(0, 0, 512, 128);
  taskCtx.fillStyle = '#00e5ff';
  taskCtx.font = 'bold 24px monospace';
  taskCtx.textAlign = 'center';
  taskCtx.fillText('TASK: Rotate Polarizer 2 to find minimum brightness', 256, 50);
  taskCtx.fillStyle = '#aaaaaa';
  taskCtx.font = '20px monospace';
  taskCtx.fillText('Grab the orange disc with your controller and rotate it', 256, 90);
  taskTex.update();

  const taskMat = new BABYLON.StandardMaterial('pol_task_mat', scene);
  taskMat.emissiveTexture = taskTex;
  taskMat.diffuseTexture  = taskTex;
  taskMat.disableLighting = true;

  const taskSign = BABYLON.MeshBuilder.CreatePlane('pol_task_sign', {
    width: 2.5, height: 0.6,
  }, scene);
  taskSign.position.set(cx - 0.25, 2.6, axisZ - 0.5);
  taskSign.rotation.x    = -0.2;
  taskSign.material      = taskMat;
  taskSign.checkCollisions = false;
  meshes.push(taskSign);

  // ═══════════════════════════════════════════════════════════════════
  // PHYSICS LOOP — update beam/screen brightness from pol2 rotation
  // ═══════════════════════════════════════════════════════════════════
  let taskComplete = false;

  scene.registerBeforeRender(() => {
    // Get pol2 rotation around X axis (the optical axis after rotation.y = PI/2)
    // SixDofDragBehavior uses rotationQuaternion when dragging, rotation otherwise
    // SixDofDragBehavior doesn't write to rotationQuaternion on TransformNode.
    // Read rotation directly from the world matrix instead.
    let angle = 0;
    pol2Root.computeWorldMatrix(true);
    const wm = pol2Root.getWorldMatrix();
    // Extract quaternion from world matrix
    const wmQuat = new BABYLON.Quaternion();
    wm.decompose(undefined, wmQuat, undefined);
    const euler = wmQuat.toEulerAngles();
    // The optical axis runs along world-X (lamp→screen).
    // After disc children's rotation.y=PI/2, rotating the polarizer
    // around the beam maps to the Z component in euler space.
    // We take the largest non-Y component to be robust to gimbal lock.
    angle = Math.abs(euler.z) > Math.abs(euler.x) ? euler.z : euler.x;

    // Malus's Law: I = I₀ × cos²(θ)
    const cosTheta  = Math.cos(angle);
    const intensity = cosTheta * cosTheta; // 0 → 1

    const angleDeg  = Math.round(Math.abs(angle * 180 / Math.PI) % 180);

    // Keep hoisted angle in sync so onDrop can read the latest value
    _lastAngleDeg = angleDeg;

    // Network: stream transform at ~20 Hz while this client owns the polarizer
    const now = performance.now();
    if (isGrabbed && !dragPending && now - _lastNetSend > 50) {
      sendTransform("polarizer", pol2Root.position, pol2Root.rotation, angleDeg);
      _lastNetSend = now;
    }

    // Update beam 2 & 3 (after pol1) brightness
    beamMat2.emissiveIntensity = 0.1 + intensity * 1.8;
    beamMat2.alpha             = 0.15 + intensity * 0.55;

    // Update screen brightness
    screenMat.emissiveIntensity = 0.05 + intensity * 3.0;
    const c = 0.05 + intensity * 0.95;
    screenMat.emissiveColor     = new BABYLON.Color3(c, c, c * 0.9);
    screenMat.albedoColor       = new BABYLON.Color3(c, c, c * 0.9);

    // Update readout panel
    _updatePanel(panelTex, angleDeg, intensity, taskComplete);

    // Task complete check: intensity < 2% (within ~8° of 90°)
    if (!taskComplete && intensity < 0.02) {
      taskComplete = true;
      _showSuccess(scene, cx, eyeY, axisZ, meshes);
      console.log('[polarization] ✅ Task complete — minimum found at', angleDeg, '°');
    }
  });

  console.log('[polarization] experiment built in datacenter');
  return { meshes };
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function _updatePanel(tex, angleDeg, intensity, complete) {
  const ctx = tex.getContext();
  ctx.fillStyle = '#001122';
  ctx.fillRect(0, 0, 512, 320);

  // Title
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('MALUS\'S LAW', 24, 44);

  ctx.fillStyle = '#555';
  ctx.font = '18px monospace';
  ctx.fillText('I = I₀ × cos²(θ)', 24, 72);

  // Angle
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`Angle (θ):`, 24, 116);
  ctx.fillStyle = '#ffdd00';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(`${angleDeg}°`, 220, 116);

  // Intensity
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`Intensity:`, 24, 166);
  const pct = Math.round(intensity * 100);
  ctx.fillStyle = intensity < 0.1 ? '#ff4444' : intensity < 0.5 ? '#ffaa00' : '#00ff88';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(`${pct}%`, 220, 166);

  // Bar graph
  ctx.fillStyle = '#333';
  ctx.fillRect(24, 188, 464, 28);
  const barColor = intensity < 0.1 ? '#ff4444' : intensity < 0.5 ? '#ffaa00' : '#00ff88';
  ctx.fillStyle = barColor;
  ctx.fillRect(24, 188, Math.round(464 * intensity), 28);

  // Status
  ctx.font = 'bold 20px monospace';
  if (complete) {
    ctx.fillStyle = '#00ff88';
    ctx.fillText('✓ MINIMUM FOUND — TASK COMPLETE!', 24, 252);
  } else if (intensity < 0.1) {
    ctx.fillStyle = '#ff4444';
    ctx.fillText('▼ Near minimum — keep rotating...', 24, 252);
  } else if (intensity < 0.5) {
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('↓ Intensity decreasing...', 24, 252);
  } else {
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('Rotate the orange polarizer →', 24, 252);
  }

  // Formula reminder
  ctx.fillStyle = '#444';
  ctx.font = '16px monospace';
  ctx.fillText('cos²(0°)=1.0   cos²(45°)=0.5   cos²(90°)=0.0', 24, 296);

  tex.update();
}

function _showSuccess(scene, cx, eyeY, axisZ, meshes) {
  // Floating success message above the experiment
  const tex = new BABYLON.DynamicTexture('pol_success_tex',
    { width: 512, height: 128 }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = '#003300';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('✓ MINIMUM INTENSITY FOUND!', 256, 52);
  ctx.fillStyle = '#aaffaa';
  ctx.font = '22px monospace';
  ctx.fillText('Polarizers are perpendicular (90°)', 256, 92);
  tex.update();

  const mat = new BABYLON.StandardMaterial('pol_success_mat', scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;

  const sign = BABYLON.MeshBuilder.CreatePlane('pol_success_sign', {
    width: 2.2, height: 0.55,
  }, scene);
  sign.position.set(cx - 0.25, eyeY + 0.9, axisZ);
  sign.material = mat;
  sign.checkCollisions = false;
  meshes.push(sign);
}

function _makeLabel(scene, text, x, y, z, meshes) {
  const lines = text.split('\n');
  const tex   = new BABYLON.DynamicTexture(`pol_lbl_${x}`, { width: 256, height: 80 }, scene, true);
  const ctx   = tex.getContext();
  ctx.fillStyle = 'transparent';
  ctx.clearRect(0, 0, 256, 80);
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => ctx.fillText(line, 128, 26 + i * 26));
  tex.update();

  const mat = new BABYLON.StandardMaterial(`pol_lbl_mat_${x}`, scene);
  mat.emissiveTexture     = tex;
  mat.diffuseTexture      = tex;
  mat.disableLighting     = true;
  mat.backFaceCulling     = false;
  if (mat.diffuseTexture) mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;

  const plane = BABYLON.MeshBuilder.CreatePlane(`pol_lbl_plane_${x}`, {
    width: 0.7, height: 0.22,
  }, scene);
  plane.position.set(x, y, z);
  plane.billboardMode  = BABYLON.Mesh.BILLBOARDMODE_Y;
  plane.material       = mat;
  plane.checkCollisions = false;
  meshes.push(plane);
}