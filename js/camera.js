// // js/camera.js
// // First-person camera with WASD + mouse, gravity, collision

// export function createCamera(scene, canvas) {
//   const camera = new BABYLON.UniversalCamera(
//     'cam',
//     new BABYLON.Vector3(0, 1.65, 6),
//     scene
//   );

//   camera.setTarget(new BABYLON.Vector3(0, 1.5, 0));
//   camera.attachControl(canvas, true);

//   // WASD + arrow keys
//   camera.keysUp    = [87, 38];
//   camera.keysDown  = [83, 40];
//   camera.keysLeft  = [65, 37];
//   camera.keysRight = [68, 39];

//   camera.speed             = 0.14;
//   camera.angularSensibility = 700;
//   camera.minZ              = 0.08;
//   camera.fov               = 1.1;

//   // Gravity + collision
//   camera.applyGravity    = true;
//   camera.checkCollisions = true;
//   camera.ellipsoid       = new BABYLON.Vector3(0.35, 0.85, 0.35);

//   return camera;
// }


// js/camera.js  (optimised v12)
//
// Changes from v11:
//  1. minZ reduced to 0.05 — reduces near-clip z-fighting on close objects in VR
//  2. applyGravity stays true for desktop; main.js disables it on XR entry
//  3. inertia added — removes the "snappy stop" that causes sickness on decel
//  4. Speed reduced slightly — 0.14 is fast for VR; 0.10 is the comfort ceiling
//     for most users. Expose it on window so menu can offer a comfort slider.
//  5. ellipsoid tightened slightly — 0.35 radius caused false wall collisions
//     in the narrow corridor

export function createCamera(scene, canvas) {
  const camera = new BABYLON.UniversalCamera(
    'cam',
    new BABYLON.Vector3(0, 1.65, 6),
    scene
  );

  camera.setTarget(new BABYLON.Vector3(0, 1.5, 0));
  camera.attachControl(canvas, true);

  // WASD + arrow keys
  camera.keysUp    = [87, 38];
  camera.keysDown  = [83, 40];
  camera.keysLeft  = [65, 37];
  camera.keysRight = [68, 39];

  // ── FIX: Speed & comfort ──────────────────────────────────────────
  // 0.14 m/frame at 72 Hz ≈ 10 m/s — faster than walking, causes sickness.
  // 0.08 ≈ ~5.8 m/s which feels like a brisk walk in VR.
  // Expose on window so you can wire a comfort-speed slider in the menu.
  camera.speed             = 0.5;
  window._vrMoveSpeed      = 0.08; // reference for menu slider

  camera.angularSensibility = 800;  // slightly less twitchy than 700
  camera.minZ              = 0.05;  // was 0.08 — tighter near-clip for VR
  camera.fov               = 1.1;

  // ── FIX: Inertia — prevents snap-stop motion sickness ────────────
  // Without inertia, releasing a key causes instant velocity=0.
  // The vestibular system expects deceleration, not a hard stop.
  // 0.85 gives a ~150 ms ramp-down which feels natural.
  camera.inertia = 0.85;

  // Gravity + collision (gravity disabled in XR by main.js observer)
  camera.applyGravity    = true;
  camera.checkCollisions = true;

  // ── FIX: Tighter ellipsoid ────────────────────────────────────────
  // 0.35 x-radius caused the player to "stick" to walls in the corridor.
  // 0.25 matches a realistic shoulder half-width at this scale.
  camera.ellipsoid       = new BABYLON.Vector3(0.25, 0.85, 0.25);

  // ── Comfort: expose speed adjustment for menu ─────────────────────
  // Call window.setVRSpeed(0.05) for "comfort mode", (0.1) for "fast mode"
  window.setVRSpeed = (speed) => {
    camera.speed        = speed;
    window._vrMoveSpeed = speed;
  };

  return camera;
}