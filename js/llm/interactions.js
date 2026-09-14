// js/llm/interactions.js
// Adds VR/desktop drag interactions to LLM-generated components.
//
// Supports the schema's `constrain` values:
//   - 'none'      : free 6-DoF
//   - 'axis-x'    : world X only (Y, Z locked to initial)
//   - 'axis-y'    : world Y only
//   - 'axis-z'    : world Z only
//   - 'plane-xy'  : Z locked
//   - 'plane-xz'  : Y locked
//   - 'plane-yz'  : X locked
//   - 'pendulum'  : constrained to arc — user-driven angle set on component
//
// Network sync:
//   Draggable components sync via the existing `updateTransform` /
//   `grabRequest` path with objectId = "exp:<specId>:<compId>". The server's
//   generic object arbitration handles ownership and rebroadcast; no new
//   message name is introduced.
//
// Dispose:
//   makeComponentDraggable returns a disposer that removes the behavior and
//   any observer / highlight state. Called by builder.dispose().

const HL_HOVER = BABYLON.Color3.FromHexString('#00e5ff');
const HL_HELD  = BABYLON.Color3.FromHexString('#ffcc44');

let _hlLayer = null;
function getHL(scene) {
  if (!_hlLayer || _hlLayer.isDisposed?.()) {
    _hlLayer = new BABYLON.HighlightLayer('llmDragHL', scene);
    _hlLayer.innerGlow = false;
    _hlLayer.outerGlow = true;
    _hlLayer.blurHorizontalSize = 1.2;
    _hlLayer.blurVerticalSize   = 1.2;
  }
  return _hlLayer;
}

// Pick the "primary" child mesh for outlining — first mesh with geometry
function pickHLTargets(component) {
  const meshes = Array.isArray(component.meshes) ? component.meshes : [];
  return meshes.filter(m => m && m.getTotalVertices && m.getTotalVertices() > 0);
}

export function makeComponentDraggable(scene, component, options = {}) {
  const {
    constrain = 'none',
    origin = [0, 0, 0],
    specId = '',
    componentId = component.props?.id || 'unknown',
    network = null,
  } = options;

  const target = component.root;
  if (!target) return null;

  // Make child meshes pickable so drag can grab any part
  const hlMeshes = pickHLTargets(component);
  hlMeshes.forEach(m => { m.isPickable = true; });

  // Capture initial world position — used to lock locked axes
  const initial = target.position.clone();

  // 6DoF drag
  const drag = new BABYLON.SixDofDragBehavior();
  drag.rotateDraggedObject = false;   // constraints only apply to translation
  drag.allowMultiPointer   = false;
  target.addBehavior(drag);

  const hl = getHL(scene);
  let dragging = false;

  // ── Hover feedback ────────────────────────────────────────────────
  const actionRegistrations = [];
  hlMeshes.forEach(mesh => {
    mesh.actionManager = mesh.actionManager || new BABYLON.ActionManager(scene);
    const enter = new BABYLON.ExecuteCodeAction(
      BABYLON.ActionManager.OnPointerOverTrigger,
      () => { if (!dragging) hlMeshes.forEach(m => hl.addMesh(m, HL_HOVER)); }
    );
    const exit = new BABYLON.ExecuteCodeAction(
      BABYLON.ActionManager.OnPointerOutTrigger,
      () => { if (!dragging) hlMeshes.forEach(m => hl.removeMesh(m)); }
    );
    mesh.actionManager.registerAction(enter);
    mesh.actionManager.registerAction(exit);
    actionRegistrations.push({ mesh, enter, exit });
  });

  // ── Constraint enforcement ────────────────────────────────────────
  // Runs each frame while dragging: clamps position to the allowed
  // subspace defined by `constrain`.
  let ownerRequested = false;
  const objectId = `exp:${specId}:${componentId}`;
  let lastSend = 0;

  const beforeRenderObs = scene.onBeforeRenderObservable.add(() => {
    if (!dragging) return;
    switch (constrain) {
      case 'axis-x':
        target.position.y = initial.y;
        target.position.z = initial.z;
        break;
      case 'axis-y':
        target.position.x = initial.x;
        target.position.z = initial.z;
        break;
      case 'axis-z':
        target.position.x = initial.x;
        target.position.y = initial.y;
        break;
      case 'plane-xy':
        target.position.z = initial.z;
        break;
      case 'plane-xz':
        target.position.y = initial.y;
        break;
      case 'plane-yz':
        target.position.x = initial.x;
        break;
      case 'pendulum': {
        // Interpret target as bob: project current position onto arc of
        // radius = distance from initial pivot (initial.y above) to initial.
        // We approximate pivot = (initial.x, initial.y + L, initial.z) where
        // L is the initial vertical drop. This is a best-effort fallback for
        // when the LLM omits a proper string. Full support lives in the
        // pendulum solver.
        // (No-op for v1: leave free.)
        break;
      }
      case 'none':
      default:
        // no clamp
        break;
    }

    // Network sync ~20 Hz while dragging
    const now = performance.now();
    if (network?.sendTransform && ownerRequested && now - lastSend > 50) {
      lastSend = now;
      try {
        network.sendTransform(objectId, target.position, target.rotation || BABYLON.Vector3.Zero(), 0);
      } catch {}
    }
  });

  drag.onDragStartObservable.add(() => {
    dragging = true;
    if (network?.requestGrab) {
      try {
        network.requestGrab(objectId);
        ownerRequested = true;
      } catch {}
    }
    hlMeshes.forEach(m => { hl.removeMesh(m); hl.addMesh(m, HL_HELD); });
  });

  drag.onDragEndObservable.add(() => {
    dragging = false;
    hlMeshes.forEach(m => hl.removeMesh(m));
    if (network?.sendTransform && ownerRequested) {
      try {
        network.sendTransform(objectId, target.position, target.rotation || BABYLON.Vector3.Zero(), 0);
      } catch {}
    }
    if (network?.releaseObject && ownerRequested) {
      try { network.releaseObject(objectId); } catch {}
    }
    ownerRequested = false;
  });

  // Subscribe to peer transform updates (only if network provides the hook)
  let unsubscribePeer = null;
  if (network?.subscribeObject) {
    try {
      unsubscribePeer = network.subscribeObject(objectId, (state, isMine) => {
        if (isMine || dragging) return;
        if (Number.isFinite(state.x) && Number.isFinite(state.y) && Number.isFinite(state.z)) {
          target.position.set(state.x, state.y, state.z);
        }
      });
    } catch {}
  }

  return function dispose() {
    scene.onBeforeRenderObservable.remove(beforeRenderObs);
    try { target.removeBehavior(drag); } catch {}
    for (const { mesh, enter, exit } of actionRegistrations) {
      try {
        mesh.actionManager?.unregisterAction(enter);
        mesh.actionManager?.unregisterAction(exit);
      } catch {}
    }
    hlMeshes.forEach(m => { try { hl.removeMesh(m); } catch {} });
    if (typeof unsubscribePeer === 'function') {
      try { unsubscribePeer(); } catch {}
    }
  };
}
