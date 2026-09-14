// js/roomManager.js
// Zone-based room visibility — hides rooms the player can't see.
//
// How it works:
//   Each room gets a TransformNode root. Every mesh built by buildX() is
//   parented to that root. Calling root.setEnabled(false) hides ALL child
//   meshes and disables their collision in one call — no per-mesh loop needed.
//
//   Every frame we check which zone the player is in, then enable only:
//     - The current room
//     - The corridor (always on — it connects everything)
//     - One adjacent room if the player is near a doorway (prevents pop-in)
//
// Usage in main.js:
//   import { createRoomManager } from './roomManager.js';
//   const rm = createRoomManager(scene, camera);
//   rm.registerRoom('lab',        labMeshes,        labFloor);
//   rm.registerRoom('corridor',   corridorMeshes,   corridorFloor);
//   rm.registerRoom('datacenter', datacenterMeshes, datacenterFloor);
//   rm.registerRoom('outdoor',    outdoorMeshes,    outdoorFloor);
//   rm.start();
//
// Each buildX() must be updated to return { floor, meshes } — see below.

import { BUILDING } from './building.js';

// ── Zone definitions (derived from building.js coordinates) ──────────────
// Each zone is an AABB in XZ — Y is ignored (single-storey building).
// "adjacent" lists which rooms to pre-enable when near a doorway.
const ZONES = {
  lab: {
    xMin: -8,  xMax: 10,
    zMin: -8,  zMax:  9,   // south edge = corridor door at z=8
    adjacent: ['corridor'],
  },
  corridor: {
    xMin: -11, xMax: 44,   // extended east to cover aiLab door
    zMin:  8,  zMax: 13,
    adjacent: ['lab', 'datacenter', 'aiLab', 'outdoor'],  // corridor sees all
  },
  datacenter: {
    xMin: 14,  xMax: 30,
    zMin: -8,  zMax:  9,
    adjacent: ['corridor'],
  },
  aiLab: {
    xMin: 30,  xMax: 46,
    zMin: -8,  zMax:  9,
    adjacent: ['corridor'],
  },
  outdoor: {
    xMin: -2,  xMax: 22,
    zMin: 12,  zMax: 34,
    adjacent: ['corridor'],
  },
};

// How close to a doorway (metres) before we pre-enable the next room
const DOORWAY_THRESHOLD = 3.5;

export function createRoomManager(scene, camera) {
  const rooms   = {};   // name → { root: TransformNode, floor: Mesh }
  let   started = false;
  let   currentZone = null;

  // ── Register a room ──────────────────────────────────────────────
  // meshes: array of all Mesh / TransformNode built by buildX()
  // floor:  the ground mesh (kept for VR teleport list — never hidden)
  function registerRoom(name, meshes, floor) {
    const root = new BABYLON.TransformNode(`room_root_${name}`, scene);

    meshes.forEach(m => {
      if (m && m.parent === null) m.parent = root;
    });

    rooms[name] = { root, floor, name };
    // Start everything visible — setZone() will cull on first tick
    root.setEnabled(true);
  }

  // ── Determine which zone a world-XZ point is in ──────────────────
  function getZone(x, z) {
    for (const [name, zone] of Object.entries(ZONES)) {
      if (x >= zone.xMin && x <= zone.xMax &&
          z >= zone.zMin && z <= zone.zMax) {
        return name;
      }
    }
    return currentZone ?? 'lab'; // fallback — never go dark
  }

  // ── Apply visibility for a given zone ────────────────────────────
  function setZone(zoneName) {
    if (zoneName === currentZone) return; // nothing changed
    currentZone = zoneName;

    const zone      = ZONES[zoneName];
    const visible   = new Set([zoneName, 'corridor', ...(zone?.adjacent ?? [])]);

    for (const [name, room] of Object.entries(rooms)) {
      const shouldShow = visible.has(name);
      if (room.root.isEnabled() !== shouldShow) {
        room.root.setEnabled(shouldShow);
      }
    }

    console.log(`[roomManager] zone → ${zoneName} | visible: ${[...visible].join(', ')}`);
  }

  // ── Per-frame check ───────────────────────────────────────────────
  // Uses scene.registerBeforeRender but only does real work when zone changes.
  // The zone comparison (getZone) is just 4 range checks — negligible cost.
  function tick() {
    const pos  = camera.globalPosition ?? camera.position;
    const zone = getZone(pos.x, pos.z);
    setZone(zone);
  }

  // ── Teleport hook — call this from effects.js on XR teleport ─────
  // Babylon fires WebXRDefaultExperience.teleportation.onTargetMeshHit
  // but the reliable hook is onBeforeCameraRenderObservable after teleport.
  // Easiest: just call rm.onTeleport() from your teleport observer in main.js.
  function onTeleport(targetPosition) {
    const zone = getZone(targetPosition.x, targetPosition.z);
    setZone(zone);
  }

  // ── Start the per-frame observer ─────────────────────────────────
  function start() {
    if (started) return;
    started = true;

    // Run every 10 frames — zone transitions are slow, no need every frame.
    // At 72 Hz this is ~7 checks/second, more than enough.
    let frameCount = 0;
    scene.registerBeforeRender(() => {
      if (++frameCount % 10 === 0) tick();
    });

    // Run once immediately so first frame isn't fully dark
    tick();
  }

  // ── Force-show all rooms (e.g. for desktop preview) ──────────────
  function showAll() {
    for (const room of Object.values(rooms)) {
      room.root.setEnabled(true);
    }
    currentZone = null;
  }

  // ── Attach extra meshes to an existing room's root ───────────────
  // Used by the AI-generated experiment runtime so dynamically-spawned
  // meshes are culled with the room.
  function attachToRoom(name, meshes) {
    const room = rooms[name];
    if (!room) {
      console.warn(`[roomManager] attachToRoom: unknown room "${name}"`);
      return;
    }
    if (!Array.isArray(meshes)) return;
    meshes.forEach(m => {
      if (m && m.parent === null) m.parent = room.root;
    });
  }

  return { registerRoom, start, onTeleport, showAll, getZone, attachToRoom };
}
