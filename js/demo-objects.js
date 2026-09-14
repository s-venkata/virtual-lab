// js/demo-objects.js
// Creates a few simple, lightweight objects you can pick up and move around.
// These act as "test items" until you load real GLB props.

import { makePickable } from './pickup.js';
import {
  requestGrab, sendTransform, releaseObject,
  getMySessionId, onObjectChange,
  onGrabAccepted, onGrabRejected,
} from './network.js';

function _wireSync(scene, mesh) {
  const id = mesh.name;
  let dragPending = false, isGrabbed = false, _netSetup = false;
  let _lastNetSend = 0;
  let _savedPos = mesh.position.clone();
  let _savedRot = mesh.rotation.clone();

  function _setupListeners() {
    if (_netSetup) return;
    const accepted = onGrabAccepted(({ objectId }) => {
      if (objectId !== id) return;
      dragPending = false;
    });
    const rejected = onGrabRejected(({ objectId }) => {
      if (objectId !== id) return;
      dragPending = false;
      isGrabbed   = false;
      mesh.position.copyFrom(_savedPos);
      mesh.rotation.copyFrom(_savedRot);
    });
    const changed = onObjectChange(id, (state) => {
      if (state.ownerId === getMySessionId()) return;
      mesh.position.set(state.x, state.y, state.z);
      mesh.rotation.set(state.rotX, state.rotY, state.rotZ);
    });
    if (accepted && rejected && changed) _netSetup = true;
  }

  scene.registerBeforeRender(() => {
    _setupListeners();
    const now = performance.now();
    if (isGrabbed && !dragPending && now - _lastNetSend > 50) {
      sendTransform(id, mesh.position, mesh.rotation, 0);
      _lastNetSend = now;
    }
  });

  return {
    onPickup: () => {
      _savedPos = mesh.position.clone();
      _savedRot = mesh.rotation.clone();
      _setupListeners();
      const ok = requestGrab(id);
      if (!ok) {
        console.warn(`[demo-objects] multiplayer not connected for ${id}`);
        return;
      }
      dragPending = true;
      isGrabbed   = true;
    },
    onDrop: () => {
      if (isGrabbed) {
        if (!dragPending) {
          sendTransform(id, mesh.position, mesh.rotation, 0);
        }
        releaseObject(id);
      }
      dragPending = false;
      isGrabbed   = false;
    },
  };
}

export function createDemoObjects(scene, M, shadow) {
  const items = [];

  // Helper to create pickable colored boxes/cylinders
  function add(mesh, options = {}) {
    mesh.checkCollisions = false;  // pickable items shouldn't block walking
    if (shadow) shadow.addShadowCaster(mesh, true);
    mesh.receiveShadows = true;
    items.push(mesh);
    makePickable(scene, mesh, {
      snapToSurface: true,
      ...options,
    });
    return mesh;
  }

  // ── Cube (red) ─────────────────────────────────────────────────────────
  const cube = BABYLON.MeshBuilder.CreateBox('demo_cube', { size: 0.18 }, scene);
  cube.position.set(-4.3, 1.0, -5.6);
  const cubeMat = new BABYLON.PBRMaterial('demo_cube_mat', scene);
  cubeMat.albedoColor = BABYLON.Color3.FromHexString('#ee3344');
  cubeMat.roughness = 0.45;
  cubeMat.metallic = 0.1;
  cube.material = cubeMat;
  add(cube, _wireSync(scene, cube));

  // ── Sphere (blue, glossy) ─────────────────────────────────────────────
  const sphere = BABYLON.MeshBuilder.CreateSphere('demo_sphere', { diameter: 0.16 }, scene);
  sphere.position.set(-4.0, 1.0, -5.6);
  const sphereMat = new BABYLON.PBRMaterial('demo_sphere_mat', scene);
  sphereMat.albedoColor = BABYLON.Color3.FromHexString('#4488ff');
  sphereMat.roughness = 0.15;
  sphereMat.metallic = 0.6;
  sphere.material = sphereMat;
  add(sphere, _wireSync(scene, sphere));

  // ── Cylinder (gold, metallic) ─────────────────────────────────────────
  const cyl = BABYLON.MeshBuilder.CreateCylinder('demo_cylinder', {
    diameter: 0.14, height: 0.22, tessellation: 32
  }, scene);
  cyl.position.set(-3.7, 1.0, -5.6);
  const cylMat = new BABYLON.PBRMaterial('demo_cyl_mat', scene);
  cylMat.albedoColor = BABYLON.Color3.FromHexString('#d4a429');
  cylMat.roughness = 0.25;
  cylMat.metallic = 0.85;
  cyl.material = cylMat;
  add(cyl, _wireSync(scene, cyl));

  // ── Tall canister (white plastic) ─────────────────────────────────────
  const canister = BABYLON.MeshBuilder.CreateCylinder('demo_canister', {
    diameter: 0.10, height: 0.30, tessellation: 24
  }, scene);
  canister.position.set(4.0, 1.0, -5.6);
  const canMat = new BABYLON.PBRMaterial('demo_can_mat', scene);
  canMat.albedoColor = BABYLON.Color3.FromHexString('#f0f0f0');
  canMat.roughness = 0.55;
  canister.material = canMat;
  add(canister, _wireSync(scene, canister));

  // ── Beaker-ish glass cylinder ─────────────────────────────────────────
  const beaker = BABYLON.MeshBuilder.CreateCylinder('demo_beaker', {
    diameterTop: 0.12, diameterBottom: 0.10, height: 0.18, tessellation: 32
  }, scene);
  beaker.position.set(4.3, 1.0, -5.6);
  const beakerMat = new BABYLON.PBRMaterial('demo_beaker_mat', scene);
  beakerMat.albedoColor = BABYLON.Color3.FromHexString('#aaccee');
  beakerMat.alpha = 0.4;
  beakerMat.transparencyMode = 2;
  beakerMat.roughness = 0.05;
  beakerMat.backFaceCulling = false;
  beaker.material = beakerMat;
  add(beaker, _wireSync(scene, beaker));

  // ── Small stack of "books" / stacked boxes ────────────────────────────
  const bookColors = ['#5577cc', '#cc5544', '#338855'];
  bookColors.forEach((hex, i) => {
    const book = BABYLON.MeshBuilder.CreateBox(`demo_book_${i}`, {
      width: 0.18, height: 0.04, depth: 0.13
    }, scene);
    book.position.set(0, 1.0 + i * 0.04, -1.0);
    const m = new BABYLON.PBRMaterial(`demo_book_mat_${i}`, scene);
    m.albedoColor = BABYLON.Color3.FromHexString(hex);
    m.roughness = 0.7;
    book.material = m;
    add(book, _wireSync(scene, book));
  });

  console.log('🎯 Created', items.length, 'pickable demo objects');
  return items;
}
