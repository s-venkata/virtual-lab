// js/doors/door.js
// v11.2:
//   - Visible hinges (3 metal cylinders on the hinge side)
//   - Doorway frame/casing — stationary, hides side and top gaps
//   - Wider door panel for tighter fit
//   - Force-opaque material
//   - Outward swing into corridor

import { getRoom } from '../network.js';

export class Door {
  constructor(scene, M, shadow, opts) {
    this.scene = scene;
    this.opts = opts;
    this.isOpen = false;
    this.targetAngle = 0;
    this.currentAngle = 0;

    const {
      name = 'door',
      position = [0, 0, 0],
      width = 1.0,
      height = 2.1,
      thickness = 0.06,
      rotation = 0,
      hingeSide = 'left',
      openAngle = Math.PI * 0.55,
    } = opts;

    // ── Materials ───────────────────────────────────────────────────
    const opaqueDoorMat = new BABYLON.PBRMaterial(`${name}_mat`, scene);
    opaqueDoorMat.albedoColor = new BABYLON.Color3(0.28, 0.30, 0.36);
    opaqueDoorMat.roughness = 0.65;
    opaqueDoorMat.metallic = 0.1;
    opaqueDoorMat.alpha = 1.0;
    opaqueDoorMat.transparencyMode = 0;
    opaqueDoorMat.backFaceCulling = true;

    const trimMat = new BABYLON.PBRMaterial(`${name}_trim_mat`, scene);
    trimMat.albedoColor = new BABYLON.Color3(0.23, 0.24, 0.30);
    trimMat.roughness = 0.7;
    trimMat.metallic = 0.05;

    const hingeMat = new BABYLON.PBRMaterial(`${name}_hinge_mat`, scene);
    hingeMat.albedoColor = new BABYLON.Color3(0.55, 0.55, 0.6);
    hingeMat.roughness = 0.3;
    hingeMat.metallic = 0.85;

    const handleMat = new BABYLON.PBRMaterial(`${name}_handle_mat`, scene);
    handleMat.albedoColor = new BABYLON.Color3(0.83, 0.87, 0.88);
    handleMat.roughness = 0.08;
    handleMat.metallic = 0.95;

    // ── Hinge sign + pivot ──────────────────────────────────────────
    const hingeSign = (hingeSide === 'left' ? -1 : 1);
    this.hingeSign = hingeSign;

    const hingeOffsetLocal = hingeSign * (width / 2);
    this.pivot = new BABYLON.TransformNode(`${name}_pivot`, scene);
    this.pivot.position.set(
      position[0] + Math.cos(rotation) * hingeOffsetLocal,
      position[1] + height / 2,
      position[2] - Math.sin(rotation) * hingeOffsetLocal
    );
    this.pivot.rotation.y = rotation;
    this.baseRotation = rotation;

    // ── Door panel — wider to reduce visible gaps ───────────────────
    const panelW = width + 0.16;
    const panel = BABYLON.MeshBuilder.CreateBox(
      `${name}_panel`,
      { width: panelW, height: height, depth: thickness },
      scene
    );
    panel.position.set(-hingeSign * (width / 2), 0, 0);
    panel.parent = this.pivot;
    panel.material = opaqueDoorMat;
    panel.checkCollisions = false;
    panel.isPickable = true;
    if (shadow) shadow.addShadowCaster(panel, true);
    this.panel = panel;

    // ── Handle ──────────────────────────────────────────────────────
    // Front-side handle
    const handle = BABYLON.MeshBuilder.CreateCylinder(
      `${name}_handle`,
      { diameter: 0.05, height: 0.12, tessellation: 14 },
      scene
    );
    handle.position.set(-hingeSign * (width * 0.85), 0, thickness * 0.7);
    handle.parent = this.pivot;
    handle.rotation.z = Math.PI / 2;
    handle.material = handleMat;
    handle.isPickable = true;
    if (shadow) shadow.addShadowCaster(handle, true);
    this.handle = handle;

    // Back-side handle (so you can open from inside)
    const handleBack = BABYLON.MeshBuilder.CreateCylinder(
      `${name}_handle_back`,
      { diameter: 0.05, height: 0.12, tessellation: 14 },
      scene
    );
    handleBack.position.set(-hingeSign * (width * 0.85), 0, -thickness * 0.7);
    handleBack.parent = this.pivot;
    handleBack.rotation.z = Math.PI / 2;
    handleBack.material = handleMat;
    handleBack.isPickable = true;
    if (shadow) shadow.addShadowCaster(handleBack, true);
    this.handleBack = handleBack;

    // ── Visible hinges (3 metal fittings on hinge side) ─────────────
    const hingeYPositions = [-height/2 + 0.25, 0, height/2 - 0.25];
    hingeYPositions.forEach((y, i) => {
      const h = BABYLON.MeshBuilder.CreateCylinder(
        `${name}_hinge_${i}`,
        { diameter: 0.045, height: 0.10, tessellation: 14 },
        scene
      );
      h.position.set(hingeSign * 0.005, y, thickness * 0.55);
      h.parent = this.pivot;
      h.material = hingeMat;
      h.rotation.x = Math.PI / 2;
      h.isPickable = false;
      if (shadow) shadow.addShadowCaster(h, true);
    });

    // ── Doorway frame/casing — STATIONARY (does NOT rotate) ─────────
    const frameRoot = new BABYLON.TransformNode(`${name}_frame_root`, scene);
    frameRoot.position.set(position[0], position[1], position[2]);
    frameRoot.rotation.y = rotation;

    const trimW = 0.06;
    const trimD = 0.18;
    const openingW = width + 0.2;

    const fL = BABYLON.MeshBuilder.CreateBox(
      `${name}_fL`, { width: trimW, height, depth: trimD }, scene
    );
    fL.position.set(-openingW/2 - trimW/2, height/2, 0);
    fL.parent = frameRoot;
    fL.material = trimMat;
    fL.isPickable = false;
    fL.checkCollisions = false;

    const fR = BABYLON.MeshBuilder.CreateBox(
      `${name}_fR`, { width: trimW, height, depth: trimD }, scene
    );
    fR.position.set(openingW/2 + trimW/2, height/2, 0);
    fR.parent = frameRoot;
    fR.material = trimMat;
    fR.isPickable = false;
    fR.checkCollisions = false;

    const fT = BABYLON.MeshBuilder.CreateBox(
      `${name}_fT`,
      { width: openingW + 2*trimW, height: trimW, depth: trimD },
      scene
    );
    fT.position.set(0, height + trimW/2, 0);
    fT.parent = frameRoot;
    fT.material = trimMat;
    fT.isPickable = false;
    fT.checkCollisions = false;

    // ── Open angle (outward swing) ──────────────────────────────────
    this.openAngle = openAngle * hingeSign;
    this.name = name;

    // ── Click to toggle ─────────────────────────────────────────────
  [panel, handle, handleBack].forEach(mesh => {
      mesh.actionManager = mesh.actionManager || new BABYLON.ActionManager(scene);
      mesh.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnPickTrigger,
        () => this.toggle()
      ));
    });

    scene.registerBeforeRender(() => {
      const diff = this.targetAngle - this.currentAngle;
      if (Math.abs(diff) > 0.001) {
        this.currentAngle += diff * 0.15;
        this.pivot.rotation.y = this.baseRotation + this.currentAngle;
      }
    });
  }

  open()   { this.isOpen = true;  this.targetAngle = this.openAngle; }
  close()  { this.isOpen = false; this.targetAngle = 0; }
  toggle(fromNetwork = false, forcedOpen = null) {
    const targetOpen = forcedOpen !== null ? forcedOpen : !this.isOpen;
    if (targetOpen) this.open();
    else this.close();
    if (!fromNetwork) {
      const room = getRoom();
      if (room) room.send("door_set", { doorId: this.name, isOpen: targetOpen });
    }
  }
}

// ── VR hold-to-open ──────────────────────────────────────────────────
export function enableVRDoorPushPull(doors, xrHelper) {
  if (!xrHelper) return;

  xrHelper.input.onControllerAddedObservable.add((controller) => {
    let grabbedDoor = null;
    let grabStartAngle = 0;
    let grabStartHandPos = null;

    controller.onMotionControllerInitObservable.add((mc) => {
      const trigger = mc.getComponent('xr-standard-trigger');
      if (!trigger) return;

      trigger.onButtonStateChangedObservable.add(() => {
        if (trigger.pressed && !grabbedDoor) {
          const handPos = controller.pointer.position;
          let closest = null;
          let closestDist = 0.3;
          for (const door of doors) {
            const dist = BABYLON.Vector3.Distance(handPos, door.handle.absolutePosition);
            if (dist < closestDist) { closest = door; closestDist = dist; }
          }
          if (closest) {
            grabbedDoor = closest;
            grabStartAngle = closest.currentAngle;
            grabStartHandPos = handPos.clone();
          }
        } else if (!trigger.pressed && grabbedDoor) {
          grabbedDoor.targetAngle = grabbedDoor.currentAngle;
          grabbedDoor.isOpen = Math.abs(grabbedDoor.currentAngle) > 0.3;
          grabbedDoor = null;
        }
      });
    });

    const scene = xrHelper.baseExperience.sessionManager.scene;
    scene.registerBeforeRender(() => {
      if (!grabbedDoor || !grabStartHandPos) return;
      const handPos = controller.pointer.position;
      const delta = handPos.subtract(grabStartHandPos);
      const doorRight = new BABYLON.Vector3(
        Math.cos(grabbedDoor.baseRotation), 0, -Math.sin(grabbedDoor.baseRotation)
      );
      const projected = BABYLON.Vector3.Dot(delta, doorRight);
      const newAngle = grabStartAngle + (projected / 0.3) * (Math.PI / 2) * grabbedDoor.hingeSign;
      const clamped = Math.max(-Math.PI/2, Math.min(Math.PI/2, newAngle));
      grabbedDoor.currentAngle = clamped;
      grabbedDoor.targetAngle = clamped;
      grabbedDoor.pivot.rotation.y = grabbedDoor.baseRotation + clamped;
    });
  });
}