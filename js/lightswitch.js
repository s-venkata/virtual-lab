// js/lightswitch.js
// Wall-mounted light switch — clickable in desktop and VR.
// Toggles all room lights, ceiling-panel emissive, and god rays.

import { getRoom } from './network.js';

export function createLightSwitch(scene, refs, position = [-7.85, 1.50, 1.0]) {
  const { hemi, sun, points, godRays, materials, extraLights = [] } = refs;

  // ── Mounting plate ─────────────────────────────────────────────
  const plate = BABYLON.MeshBuilder.CreateBox('switch_plate', {
    width: 0.025, height: 0.13, depth: 0.085,
  }, scene);
  plate.position.set(...position);

  const plateMat = new BABYLON.PBRMaterial('switch_plate_mat', scene);
  plateMat.albedoColor = BABYLON.Color3.FromHexString('#6d69a2');
  plateMat.roughness   = 0.5;
  plateMat.metallic    = 0.0;
  plate.material       = plateMat;
  plate.checkCollisions = false;

  // ── Toggle (the bit you flip) ──────────────────────────────────
  const toggle = BABYLON.MeshBuilder.CreateBox('switch_toggle', {
    width: 0.022, height: 0.045, depth: 0.022,
  }, scene);
  toggle.parent = plate;
  toggle.position = new BABYLON.Vector3(0.018, 0.015, 0); // ON position (raised)

  const toggleMat = new BABYLON.PBRMaterial('switch_toggle_mat', scene);
  toggleMat.albedoColor = BABYLON.Color3.FromHexString('#1a1a1a');
  toggleMat.roughness   = 0.4;
  toggleMat.metallic    = 0.2;
  toggle.material       = toggleMat;

  // ── Indicator LED (glows red when lights are OFF) ──────────────
  const led = BABYLON.MeshBuilder.CreateSphere('switch_led', {
    diameter: 0.008, segments: 8,
  }, scene);
  led.parent = plate;
  led.position = new BABYLON.Vector3(0.018, -0.045, 0.025);

  const ledMat = new BABYLON.PBRMaterial('switch_led_mat', scene);
  ledMat.albedoColor       = BABYLON.Color3.FromHexString('#660000');
  ledMat.emissiveColor     = BABYLON.Color3.FromHexString('#ff0000');
  ledMat.emissiveIntensity = 0;
  led.material = ledMat;

  // ── State ──────────────────────────────────────────────────────
  let lightsOn = true;

  const applyState = () => {
    // Disable / enable lights
    sun.setEnabled(lightsOn);
    points.forEach(p => p.setEnabled(lightsOn));
    extraLights.forEach(l => { if (l && l.setEnabled) l.setEnabled(lightsOn); });

    // Hemi keeps a tiny minimum so room isn't pitch-black (you can still see)
    hemi.intensity = lightsOn ? 0.22 : 0.03;

    // Ceiling glow panels
    materials.glowPanel.emissiveIntensity = lightsOn ? 1.8 : 0;

    // God rays
    if (godRays) godRays.forEach(c => c.setEnabled(lightsOn));

    // Indicator LED — red glow when OFF
    ledMat.emissiveIntensity = lightsOn ? 0 : 5;

    // Toggle visual flip
    toggle.position.y = lightsOn ? 0.015 : -0.015;
  };

  const _setLight = (newState) => {
    lightsOn = newState;
    applyState();
  };

  const flip = () => {
    lightsOn = !lightsOn;
    applyState();
    const room = getRoom();
    if (room) room.send("light_set", { state: lightsOn });
  };

  // ── Interaction (mouse click + VR controller trigger) ──────────
  [plate, toggle].forEach(mesh => {
    mesh.actionManager = new BABYLON.ActionManager(scene);

    mesh.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
      BABYLON.ActionManager.OnPickTrigger,
      flip
    ));

    mesh.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
      BABYLON.ActionManager.OnPointerOverTrigger,
      () => { plate.scaling = new BABYLON.Vector3(1.06, 1.06, 1.06); }
    ));

    mesh.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
      BABYLON.ActionManager.OnPointerOutTrigger,
      () => { plate.scaling = new BABYLON.Vector3(1, 1, 1); }
    ));
  });

  return { flip, plate, setLight: _setLight };
}
