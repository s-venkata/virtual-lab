// js/avatar.js — Remote player avatar rendering
//
// Root is placed at the remote camera position (eye level, ~1.65 m above floor).
// All child meshes are offset downward so the figure stands on the floor.
// Laser + hit-dot meshes are world-space (no parent) so they don't inherit root lerp.
// Avatars are NOT parented to any room node so they stay visible across zones.
//
// API:
//   spawnAvatar(scene, sid, playerState)
//   removeAvatar(sid)
//   updateAvatarTarget(sid, playerState)
//   startAvatarLerp(scene)   — call once; guarded against double-registration

const avatars      = new Map();   // sid → { root, targetPos, targetQuat, laser, hitDot, ... }
let   _headMat     = null;
let   _lerpStarted = false;

// ── Colour ────────────────────────────────────────────────────────────────
function _colorForSid(sid) {
  let hash = 0;
  for (let i = 0; i < sid.length; i++) {
    hash = ((hash << 5) - hash) + sid.charCodeAt(i);
    hash |= 0;
  }
  return BABYLON.Color3.FromHSV(Math.abs(hash % 360), 0.75, 1.0);
}

// ── Laser alignment — zero per-frame allocations ──────────────────────────
// Temp vectors pre-allocated at module level
const _la = BABYLON.Vector3.Zero();
const _lb = BABYLON.Vector3.Zero();
const _lc = BABYLON.Vector3.Zero();

// Rotates a unit-height cylinder (Y-axis) to span world-space from → to.
// mesh.rotationQuaternion must be pre-set to Identity() at creation time.
function _alignCylinder(mesh, from, to) {
  to.subtractToRef(from, _la);          // direction vector
  const len = _la.length();
  if (len < 0.01) { mesh.setEnabled(false); return; }
  mesh.setEnabled(true);

  BABYLON.Vector3.LerpToRef(from, to, 0.5, _lb);
  mesh.position.copyFrom(_lb);          // midpoint
  mesh.scaling.y = len;

  _la.normalizeToRef(_la);
  const dot = BABYLON.Vector3.Dot(BABYLON.Axis.Y, _la);
  BABYLON.Vector3.CrossToRef(BABYLON.Axis.Y, _la, _lc);

  if (Math.abs(dot + 1) < 0.001) {
    mesh.rotationQuaternion.set(1, 0, 0, 0);        // antiparallel edge case
  } else {
    mesh.rotationQuaternion.set(_lc.x, _lc.y, _lc.z, 1 + dot);
    mesh.rotationQuaternion.normalize();             // in-place, no allocation
  }
}

// ── Shared head material ──────────────────────────────────────────────────
function _ensureHeadMat(scene) {
  if (_headMat) return;
  _headMat = new BABYLON.StandardMaterial("av_head_shared", scene);
  _headMat.emissiveColor   = new BABYLON.Color3(0.92, 0.78, 0.64);
  _headMat.disableLighting = true;
}

function _makeMesh(scene, type, name, opts, parent, mat) {
  const m = BABYLON.MeshBuilder["Create" + type](name, opts, scene);
  m.parent      = parent;
  m.material    = mat;
  m.isPickable  = false;
  return m;
}

// ── spawnAvatar ───────────────────────────────────────────────────────────
export function spawnAvatar(scene, sid, playerState) {
  if (avatars.has(sid)) return;
  _ensureHeadMat(scene);

  // Per-avatar body colour
  const bodyMat            = new BABYLON.StandardMaterial("av_bmat_" + sid, scene);
  bodyMat.emissiveColor    = _colorForSid(sid);
  bodyMat.disableLighting  = true;

  // Per-avatar laser colour (same hue as body)
  const laserMat           = new BABYLON.StandardMaterial("av_lmat_" + sid, scene);
  laserMat.emissiveColor   = _colorForSid(sid);
  laserMat.disableLighting = true;

  // Root at camera / eye level (y ≈ 1.65 above floor).
  // All body parts offset so feet touch floor.
  const root = new BABYLON.TransformNode("av_root_" + sid, scene);
  const B    = (type, name, opts) => _makeMesh(scene, type, "av_" + name + "_" + sid, opts, root, bodyMat);
  const H    = (type, name, opts) => _makeMesh(scene, type, "av_" + name + "_" + sid, opts, root, _headMat);

  const head = H("Sphere", "head", { diameter: 0.28, segments: 8 });
  head.position.y = 0;

  const torso = B("Cylinder", "torso", { diameterTop: 0.38, diameterBottom: 0.34, height: 0.62, tessellation: 8 });
  torso.position.y = -0.68;

  const lArm = B("Cylinder", "larm", { diameter: 0.10, height: 0.52, tessellation: 6 });
  lArm.position.set(-0.27, -0.60, 0);
  lArm.rotation.z = Math.PI / 7;

  const rArm = B("Cylinder", "rarm", { diameter: 0.10, height: 0.52, tessellation: 6 });
  rArm.position.set( 0.27, -0.60, 0);
  rArm.rotation.z = -Math.PI / 7;

  const lLeg = B("Cylinder", "lleg", { diameter: 0.13, height: 0.65, tessellation: 6 });
  lLeg.position.set(-0.11, -1.33, 0);

  const rLeg = B("Cylinder", "rleg", { diameter: 0.13, height: 0.65, tessellation: 6 });
  rLeg.position.set( 0.11, -1.33, 0);

  // ── Laser beam (world-space, no parent) ──────────────────────────────
  const laser = BABYLON.MeshBuilder.CreateCylinder("av_laser_" + sid,
    { diameter: 0.012, height: 1.0, tessellation: 4 }, scene);
  laser.material           = laserMat;
  laser.isPickable         = false;
  laser.rotationQuaternion = BABYLON.Quaternion.Identity();  // pre-alloc for in-place updates
  laser.setEnabled(false);

  // ── Hit dot (world-space, no parent) ─────────────────────────────────
  const hitDot = BABYLON.MeshBuilder.CreateSphere("av_dot_" + sid,
    { diameter: 0.05, segments: 4 }, scene);
  hitDot.material   = laserMat;
  hitDot.isPickable = false;
  hitDot.setEnabled(false);

  // ── Name label ────────────────────────────────────────────────────────
  const labelTex = new BABYLON.DynamicTexture("av_lbl_tex_" + sid, { width: 256, height: 64 }, scene, true);
  const ctx      = labelTex.getContext();
  ctx.fillStyle  = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle  = "#ffffff";
  ctx.font       = "bold 28px sans-serif";
  ctx.textAlign  = "center";
  ctx.fillText(playerState.name, 128, 44);
  labelTex.update();

  const labelMat                      = new BABYLON.StandardMaterial("av_lbl_mat_" + sid, scene);
  labelMat.emissiveTexture            = labelTex;
  labelMat.diffuseTexture             = labelTex;
  labelMat.diffuseTexture.hasAlpha    = true;
  labelMat.useAlphaFromDiffuseTexture = true;
  labelMat.disableLighting            = true;
  labelMat.backFaceCulling            = false;

  const label       = _makeMesh(scene, "Plane", "av_lbl_" + sid, { width: 0.90, height: 0.22 }, root, labelMat);
  label.position.y  = 0.30;
  label.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

  // ── Initial transform ─────────────────────────────────────────────────
  const targetPos  = new BABYLON.Vector3(playerState.x, playerState.y, playerState.z);
  const targetQuat = new BABYLON.Quaternion(playerState.qx, playerState.qy, playerState.qz, playerState.qw);
  root.position.copyFrom(targetPos);
  root.rotationQuaternion = targetQuat.clone();

  avatars.set(sid, {
    root, targetPos, targetQuat,
    laser, hitDot, laserMat, labelMat, labelTex,
    laserStart : new BABYLON.Vector3(),
    laserEnd   : new BABYLON.Vector3(),
    laserOn    : false,
  });
  console.log(`[avatar] spawned ${sid} (${playerState.name})`);
}

// ── removeAvatar ──────────────────────────────────────────────────────────
export function removeAvatar(sid) {
  const av = avatars.get(sid);
  if (!av) return;
  av.root.getChildMeshes().forEach(m => m.dispose());
  av.root.dispose();
  av.laser.dispose();
  av.hitDot.dispose();
  av.laserMat?.dispose();
  av.labelMat?.dispose();
  av.labelTex?.dispose();
  avatars.delete(sid);
  console.log(`[avatar] removed ${sid}`);
}

// ── updateAvatarTarget ────────────────────────────────────────────────────
export function updateAvatarTarget(sid, playerState) {
  const av = avatars.get(sid);
  if (!av) return;
  av.targetPos.set(playerState.x,  playerState.y,  playerState.z);
  av.targetQuat.set(playerState.qx, playerState.qy, playerState.qz, playerState.qw);
  av.laserStart.set(playerState.lx1, playerState.ly1, playerState.lz1);
  av.laserEnd.set  (playerState.lx2, playerState.ly2, playerState.lz2);
  av.laserOn = playerState.laserOn;
}

// ── startAvatarLerp ───────────────────────────────────────────────────────
// Register once — lerps all avatars toward their network targets each frame
// and updates laser beams directly (no lerp needed for laser).
export function startAvatarLerp(scene) {
  if (_lerpStarted) return;
  _lerpStarted = true;

  const F = 0.2;
  scene.registerBeforeRender(() => {
    avatars.forEach(av => {
      // Position / rotation lerp
      BABYLON.Vector3.LerpToRef(
        av.root.position, av.targetPos, F, av.root.position);
      BABYLON.Quaternion.SlerpToRef(
        av.root.rotationQuaternion, av.targetQuat, F,
        av.root.rotationQuaternion);

      // Laser — direct update (no smoothing; laser should snap)
      if (av.laserOn) {
        _alignCylinder(av.laser, av.laserStart, av.laserEnd);
        av.hitDot.position.copyFrom(av.laserEnd);
        av.hitDot.setEnabled(true);
      } else {
        av.laser.setEnabled(false);
        av.hitDot.setEnabled(false);
      }
    });
  });
}
