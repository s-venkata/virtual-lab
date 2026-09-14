// js/network.js — Colyseus client for VR lab multiplayer
//
// Connects to the Colyseus server through the Vite HTTPS proxy:
//   wss://host:3000/colyseus  →  ws://localhost:3001
//
// Usage:
//   import { initNetwork, setNetworkCamera } from './network.js';
//   await initNetwork(scene, { onJoin, onLeave, onMove });
//   setNetworkCamera(() => camera);  // swap to XR camera when in VR

import { Client, getStateCallbacks } from 'colyseus.js';

let _room        = null;
let _mySessionId = null;
let _getCam      = () => null;
const _reconnectedListeners = new Set();

export function setNetworkCamera(fn) {
  _getCam = fn;
}

// ── Laser activation state ────────────────────────────────────────────────
let _mouseDown        = false;
let _keyLDown         = false;
let _listenersAdded   = false;

function _installDesktopListeners() {
  if (_listenersAdded) return;
  _listenersAdded = true;
  window.addEventListener('mousedown', e => { if (e.button === 0) _mouseDown = true;  });
  window.addEventListener('mouseup',   e => { if (e.button === 0) _mouseDown = false; });
  window.addEventListener('keydown',   e => { if (e.code === 'KeyL') _keyLDown = true;  });
  window.addEventListener('keyup',     e => { if (e.code === 'KeyL') _keyLDown = false; });
}

function _isLaserActive(xr) {
  // VR: trigger button (index 0 on XR standard gamepad)
  if (xr?.input?.controllers?.length) {
    const rc = xr.input.controllers.find(c => c.inputSource.handedness === 'right')
            ?? xr.input.controllers[0];
    if (rc) {
      const trigger = rc.inputSource.gamepad?.buttons[0];
      if (trigger && (trigger.pressed || trigger.value > 0.1)) return true;
    }
  }
  // Desktop: left mouse button or L key
  return _mouseDown || _keyLDown;
}

// ── Laser pre-allocations ─────────────────────────────────────────────────
// All mutated in-place — no per-send allocations except inside Babylon internals
const _LASER_MAX   = 20;
const _laserRay    = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward(), _LASER_MAX);
const _laserEnd    = BABYLON.Vector3.Zero();
const _forward     = BABYLON.Vector3.Forward();
const _laserResult = { laserOn: false, lx1: 0, ly1: 0, lz1: 0, lx2: 0, ly2: 0, lz2: 0 };

function _pickLaser(scene) {
  const hit = scene.pickWithRay(_laserRay, m => m.isPickable && !m.name.startsWith('av_'));
  if (hit?.hit && hit.pickedPoint) {
    _laserEnd.copyFrom(hit.pickedPoint);
  } else {
    _laserRay.direction.scaleToRef(_LASER_MAX, _laserEnd);
    _laserEnd.addInPlace(_laserRay.origin);
  }
  _laserResult.laserOn = true;
  _laserResult.lx1 = _laserRay.origin.x; _laserResult.ly1 = _laserRay.origin.y; _laserResult.lz1 = _laserRay.origin.z;
  _laserResult.lx2 = _laserEnd.x;        _laserResult.ly2 = _laserEnd.y;        _laserResult.lz2 = _laserEnd.z;
  return _laserResult;
}

function _computeLaser(cam, scene) {
  const xr = window.xrExperience;

  // Gate: laser only fires when user actively holds trigger / mouse / L key
  if (!_isLaserActive(xr)) {
    _laserResult.laserOn = false;
    return _laserResult;
  }

  // VR: prefer built-in pointer/aim ray, fallback to pointer transform
  if (xr?.input?.controllers?.length) {
    const rc = xr.input.controllers.find(c => c.inputSource.handedness === 'right')
            ?? xr.input.controllers[0];
    let hasRay = false;
    if (rc) {
      if (rc.getWorldPointerRayToRef) {
        rc.getWorldPointerRayToRef(_laserRay);   // pointer/aim ray (not grip)
        hasRay = true;
      } else if (rc.pointer) {
        _laserRay.origin.copyFrom(rc.pointer.absolutePosition);
        rc.pointer.getDirectionToRef(_forward, _laserRay.direction);
        hasRay = true;
      }
      if (hasRay) {
        _laserRay.length = _LASER_MAX;
        return _pickLaser(scene);
      }
      // rc exists but no valid ray method — fall through to desktop
    }
  }

  // Desktop: use ToRef variant to avoid allocating a new Ray object
  if (cam?.getForwardRayToRef) {
    cam.getForwardRayToRef(_laserRay, _LASER_MAX);   // ray first, length second (Babylon API)
    return _pickLaser(scene);
  }
  if (cam?.getForwardRay) {
    const r = cam.getForwardRay(_LASER_MAX);   // fallback — one allocation
    _laserRay.origin.copyFrom(r.origin);
    _laserRay.direction.copyFrom(r.direction);
    _laserRay.length = _LASER_MAX;
    return _pickLaser(scene);
  }

  _laserResult.laserOn = false;
  return _laserResult;
}

// ── connect ───────────────────────────────────────────────────────────────
export async function connect(playerName) {
  if (_room) return _room;
  const c = new Client(`wss://${location.host}/colyseus`);
  _room = await c.joinOrCreate("lab", { name: playerName });
  _mySessionId = _room.sessionId;
  return _room;
}

// ── initNetwork ───────────────────────────────────────────────────────────
export async function initNetwork(scene, { onJoin, onLeave, onMove }) {
  _installDesktopListeners();   // idempotent — safe to call multiple times

  const raw  = window.prompt("Enter your display name:", "") ?? "";
  const name = raw.trim() || "Anon_" + Math.random().toString(36).slice(2, 6);

  try {
    await connect(name);
  } catch (e) {
    console.warn("[network] Could not connect to Colyseus:", e.message);
    return;  // lab still works single-player if server is down
  }

  const myId = _mySessionId;
  const $    = getStateCallbacks(_room);

  $(_room.state).players.onAdd((player, sid) => {
    if (sid === myId) return;
    onJoin(sid, player);

    $(player).onChange(() => {
      if (sid !== myId) onMove(sid, player);
    });
  });

  $(_room.state).players.onRemove((_player, sid) => {
    onLeave(sid);
  });

  // ── Clean shutdown when the WebSocket drops ──────────────────────────────
  // Without this, _room stays defined after disconnect and every guard like
  // `if (!_room) return;` keeps holding a stale reference. Resetting _room
  // here makes the existing guards in requestGrab/sendTransform/etc. take
  // effect, so the lab gracefully falls back to single-player mode instead
  // of throwing "WebSocket is already in CLOSING or CLOSED state" 20×/sec.
  _room.onLeave((code, reason) => {
    console.warn(`[network] disconnected from Colyseus (code=${code}${reason ? ', reason=' + reason : ''}) — single-player mode`);
    _room        = null;
    _mySessionId = null;
  });

  _room.onError((code, message) => {
    console.warn(`[network] colyseus error (code=${code}): ${message}`);
  });

  // 20 Hz send loop — rate-independent of VR frame rate (72-90 Hz)
  setInterval(() => {
    const cam = _getCam();
    // Belt-and-suspenders: even if onLeave hasn't fired yet, readyState flips
    // to CLOSING/CLOSED synchronously on disconnect, so isOpen guards the
    // tight loop ahead of any async cleanup.
    if (!_room || !cam || !_room.connection?.isOpen) return;

    const pos = cam.globalPosition ?? cam.position;
    let q = cam.rotationQuaternion;
    if (!q) {
      const r = cam.rotation;
      q = BABYLON.Quaternion.RotationYawPitchRoll(r.y, r.x, r.z);
    }

    const laser = _computeLaser(cam, scene);
    _room.send("move", {
      x:  pos.x, y:  pos.y, z:  pos.z,
      qx: q.x,   qy: q.y,   qz: q.z,  qw: q.w,
      lx1: laser.lx1, ly1: laser.ly1, lz1: laser.lz1,
      lx2: laser.lx2, ly2: laser.ly2, lz2: laser.lz2,
      laserOn: laser.laserOn,
    });
  }, 50);

  console.log(`[network] Joined room ${_room.id} as ${myId} (${name})`);
}

// ── Object grab / release / transform ────────────────────────────────────

export function requestGrab(objectId) {
  if (!_room) return false;
  _room.send("grabRequest", { objectId });
  return true;
}

export function sendTransform(objectId, position, rotation, value = 0) {
  if (!_room) return false;
  _room.send("updateTransform", {
    objectId,
    x: position.x,    y: position.y,    z: position.z,
    rotX: rotation?.x ?? 0,
    rotY: rotation?.y ?? 0,
    rotZ: rotation?.z ?? 0,
    value,
  });
  return true;
}

export function releaseObject(objectId) {
  if (!_room) return false;
  _room.send("releaseObject", { objectId });
  return true;
}

export function getMySessionId() {
  return _mySessionId;
}

export function getRoom() {
  return _room;
}

export function onObjectChange(objectId, callback) {
  if (!_room) return false;
  if (!_room.state) return false;
  if (!_room.state.objects) return false;

  const $ = getStateCallbacks(_room);
  const obj = _room.state.objects.get(objectId);

  if (obj) {
    callback(obj);
    $(obj).onChange(() => callback(obj));
  } else {
    $(_room.state).objects.onAdd?.((o, key) => {
      if (key !== objectId) return;
      callback(o);
      $(o).onChange(() => callback(o));
    });
  }

  return true;
}

export function onGrabAccepted(callback) {
  if (!_room) return false;
  _room.onMessage("grabAccepted", callback);
  return true;
}

export function onGrabRejected(callback) {
  if (!_room) return false;
  _room.onMessage("grabRejected", callback);
  return true;
}

// ── AI-generated experiments ─────────────────────────────────────────────
// Specs are JSON-serialized and stored on the server. We piggy-back simple
// onMessage relays for v1 (the schema-based MapSchema sync arrives in F2).

export function broadcastExperimentSpec(spec) {
  if (!_room) return false;
  _room.send('experiment_spawn', { spec });
  return true;
}

export function removeExperimentSpec(id) {
  if (!_room) return false;
  _room.send('experiment_remove', { id });
  return true;
}

// Subscribe with { onAdd(id, spec), onRemove(id), onError?(msg) }
export function onExperimentMessages(handlers) {
  if (!_room) return false;
  _room.onMessage('experiment_spawn', (data) => {
    if (data?.spec?.id) handlers.onAdd?.(data.spec.id, data.spec);
  });
  _room.onMessage('experiment_remove', (data) => {
    if (data?.id) handlers.onRemove?.(data.id);
  });
  // Server replays existing experiments via "experiment_replay"
  _room.onMessage('experiment_replay', (data) => {
    if (Array.isArray(data?.specs)) {
      data.specs.forEach(s => handlers.onAdd?.(s.id, s));
    }
  });
  // Server-emitted validation errors on spawn attempts
  _room.onMessage('experiment_error', (data) => {
    if (data?.message) {
      console.warn('[network] experiment_error:', data.message, data.errors || '');
      handlers.onError?.(data.message, data.errors);
    }
  });
  // Ask the server for the current set
  _room.send('experiment_request_sync', {});
  return true;
}

// ── Adapter consumed by js/llm/runtime.js ────────────────────────────────
export function createAiNetworkAdapter(getRoomFn) {
  return {
    broadcastExperiment: (spec) => {
      if (!getRoomFn?.()) return false;
      return broadcastExperimentSpec(spec);
    },
    removeExperiment: (id) => {
      if (!getRoomFn?.()) return false;
      return removeExperimentSpec(id);
    },
    subscribeExperiments: (handlers) => {
      // Wait until the room is connected, then bind
      const tryBind = () => {
        if (getRoomFn?.()) {
          onExperimentMessages(handlers);
        } else {
          setTimeout(tryBind, 500);
        }
      };
      tryBind();
    },
    // ── Draggable-component transform sync (uses generic object channel) ──
    requestGrab:  (objectId) => requestGrab(objectId),
    releaseObject:(objectId) => releaseObject(objectId),
    sendTransform:(objectId, pos, rot, value) => sendTransform(objectId, pos, rot, value),
    subscribeObject: (objectId, cb) => {
      // Wraps onObjectChange to expose { state, isMine } and returns an
      // unsubscribe function (best-effort; Colyseus doesn't expose removal).
      const room = getRoomFn?.();
      if (!room) return () => {};
      onObjectChange(objectId, (state) => {
        try {
          const isMine = state.ownerId && state.ownerId === _mySessionId;
          cb(state, isMine);
        } catch {}
      });
      return () => {}; // no-op; callbacks last for the room's lifetime
    },
    // ── Reconnect notification for the runtime ─────────────────────
    onReconnected: (fn) => {
      _reconnectedListeners.add(fn);
      return () => _reconnectedListeners.delete(fn);
    },
  };
}
