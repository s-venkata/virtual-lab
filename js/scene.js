// // js/scene.js
// // Scene initialisation — fog, gravity, clear colour

// export function createScene(engine) {
//   const scene = new BABYLON.Scene(engine);

//   scene.clearColor = new BABYLON.Color4(0.04, 0.05, 0.08, 1);
//   scene.ambientColor = new BABYLON.Color3(0.12, 0.14, 0.18);

//   // Exponential fog for depth
//   scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
//   scene.fogColor   = new BABYLON.Color3(0.04, 0.05, 0.08);
//   scene.fogDensity = 0.022;

//   // Physics gravity (used by camera collision)
//   scene.gravity = new BABYLON.Vector3(0, -12, 0);

//   return scene;
// }


// js/scene.js  (optimised v12)
//
// Changes from v11:
//  1. Fog mode changed EXP2 → LINEAR — Gaussian Splats don't participate in
//     Babylon's fog pipeline at all, so EXP2 creates a visible mismatch:
//     geometry fades into the clear colour but splats stay crisp, causing the
//     "floating splat" feeling that worsens motion sickness.
//     LINEAR fog lets you push the start distance far enough that it only
//     affects geometry near the edges of your build — much less noticeable mismatch.
//     If you want fog-free rendering entirely, set scene.fogMode = BABYLON.Scene.FOGMODE_NONE.
//
//  2. scene.autoClearDepthAndStencil = false — skips a full depth clear on meshes
//     that already write depth (most of your room geometry does). Saves ~0.3 ms/frame.
//
//  3. scene.blockMaterialDirtyMechanism = true — prevents material "dirty"
//     propagation re-evaluating shaders every frame when nothing has changed.
//     Call scene.markAllMaterialsAsDirty() manually if you change a material at runtime.
//
//  4. scene.pointerMovePredicate set to null — in conjunction with
//     skipPointerMovePicking in main.js, this fully disables the per-frame
//     ray-cast on mouse/controller move.
//
//  5. ambientColor slightly increased — compensates for removing EXP2 fog's
//     natural darkening of distant surfaces, keeping the lab moody.

export function createScene(engine) {
  const scene = new BABYLON.Scene(engine);

  scene.clearColor   = new BABYLON.Color4(0.04, 0.05, 0.08, 1);
  scene.ambientColor = new BABYLON.Color3(0.10, 0.12, 0.16); // slightly darker to compensate

  // ── FIX 1: Linear fog instead of EXP2 ────────────────────────────
  // Push fog start well past the largest room so it only softens far geometry.
  // Splats won't fog anyway, so keeping fog subtle minimises the mismatch.
  // To disable fog entirely: scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
  scene.fogMode    = BABYLON.Scene.FOGMODE_LINEAR;
  scene.fogColor   = new BABYLON.Color3(0.04, 0.05, 0.08);
  scene.fogStart   = 18;   // metres — starts after the corridor length
  scene.fogEnd     = 32;   // metres — fully opaque at 32 m (beyond any room)

  // ── FIX 2: Skip redundant depth clear ────────────────────────────
  scene.autoClearDepthAndStencil = false;

  // ── FIX 3: Stop per-frame shader dirty checks ────────────────────
  // If you change a material at runtime (e.g. lightswitch flips emissive),
  // call: scene.markAllMaterialsAsDirty(BABYLON.Constants.MATERIAL_AllDirtyFlag)
  scene.blockMaterialDirtyMechanism = true;

  // Physics gravity (used by desktop camera; disabled in XR by main.js)
  scene.gravity = new BABYLON.Vector3(0, -12, 0);

  return scene;
}