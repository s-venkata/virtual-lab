// js/pickup.js
// VR + desktop pickup with snap-to-surface on release.
//
// Features:
//  - Cyan outline on hover, green while held
//  - 6DOF dragging (works in VR controller and mouse)
//  - On release: object auto-drops to nearest surface below it
//  - Handles GLB/OBJ models with nested parents (unwraps cleanly)
//  - Optional reset-to-original-position

let _highlightLayer = null;
const COLOR_HOVER = BABYLON.Color3.FromHexString('#00e5ff');
const COLOR_HELD  = BABYLON.Color3.FromHexString('#00ff66');

function getHighlight(scene) {
  if (!_highlightLayer) {
    _highlightLayer = new BABYLON.HighlightLayer('pickupHL', scene);
    _highlightLayer.innerGlow = false;
    _highlightLayer.outerGlow = true;
    _highlightLayer.blurHorizontalSize = 1.2;
    _highlightLayer.blurVerticalSize   = 1.2;
  }
  return _highlightLayer;
}

// ── Find the nearest surface below the object ───────────────────────────────
// Returns y-coord of surface, or null if nothing found
function findSurfaceBelow(scene, position, ignoreMesh) {
  // Cast ray straight down from object's center
  const ray = new BABYLON.Ray(
    new BABYLON.Vector3(position.x, position.y + 0.05, position.z),
    new BABYLON.Vector3(0, -1, 0),
    20  // max distance
  );

  // Find first mesh hit (excluding the object itself and its children)
  const hit = scene.pickWithRay(ray, (mesh) => {
    if (!mesh.isPickable) return false;
    if (mesh === ignoreMesh) return false;
    if (mesh._isPickupChild) return false;
    if (ignoreMesh._isParentOf && ignoreMesh._isParentOf(mesh)) return false;
    // Skip pickable items
    if (mesh._isPickable) return false;
    return true;
  });

  return hit?.hit ? hit.pickedPoint.y : null;
}

// ── Setup pickup on a single mesh/node ───────────────────────────────────────
function setupOne(scene, target, options) {
  const isContainer = target instanceof BABYLON.TransformNode && !(target instanceof BABYLON.Mesh);

  // Get the visual meshes for highlighting
  let visualMeshes;
  if (isContainer) {
    visualMeshes = target.getChildMeshes(false).filter(m => m.material && m.getTotalVertices() > 0);
  } else {
    visualMeshes = [target];
  }

  // Mark all visual children so they don't trigger surface detection
  visualMeshes.forEach(m => { m._isPickupChild = true; });
  target._isPickable = true;

  // Save original transform
  const original = {
    position: target.position.clone(),
    rotation: target.rotation.clone(),
  };
  target._pickupOriginal = original;

  // 6DOF drag behavior
  const drag = new BABYLON.SixDofDragBehavior();
  drag.rotateDraggedObject = options.rotateOnDrag !== false;
  drag.allowMultiPointer   = false;
  target.addBehavior(drag);

  const hl = options.highlight !== false ? getHighlight(scene) : null;
  let isDragging = false;

  // ── Hover effects ─────────────────────────────────────────────────
  if (hl) {
    visualMeshes.forEach(mesh => {
      mesh.actionManager = mesh.actionManager || new BABYLON.ActionManager(scene);

      mesh.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnPointerOverTrigger,
        () => {
          if (isDragging) return;
          visualMeshes.forEach(m => hl.addMesh(m, COLOR_HOVER));
        }
      ));

      mesh.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnPointerOutTrigger,
        () => {
          if (isDragging) return;
          visualMeshes.forEach(m => hl.removeMesh(m));
        }
      ));
    });
  }

  // ── Grab ─────────────────────────────────────────────────────────
  drag.onDragStartObservable.add(() => {
    isDragging = true;
    if (hl) {
      visualMeshes.forEach(m => {
        hl.removeMesh(m);
        hl.addMesh(m, COLOR_HELD);
      });
    }
    if (options.onPickup) options.onPickup(target);
  });

  // ── Drop ─────────────────────────────────────────────────────────
  drag.onDragEndObservable.add(() => {
    isDragging = false;
    if (hl) visualMeshes.forEach(m => hl.removeMesh(m));

    // Snap to surface below
    if (options.snapToSurface !== false) {
      const pos = target.absolutePosition || target.position;
      const surfaceY = findSurfaceBelow(scene, pos, target);
    if (surfaceY !== null) {
      // Get bounding box including all children
      const bb = target.getHierarchyBoundingVectors(true);
      const bottomOfObject = bb.min.y;
      const objectCenterY = target.position.y;
      const heightFromCenterToBottom = objectCenterY - bottomOfObject;
      
      // Place object so its bottom rests on surface
      target.position.y = surfaceY + heightFromCenterToBottom;
      
      if (options.onSnap) options.onSnap(target, surfaceY);
    }
  }

    if (options.resetOnRelease) {
      target.position.copyFrom(original.position);
      target.rotation.copyFrom(original.rotation);
    }

    if (options.onDrop) options.onDrop(target);
  });

  return drag;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function makePickable(scene, target, options = {}) {
  const targets = Array.isArray(target) ? target : [target];
  targets.forEach(t => { if (t) setupOne(scene, t, options); });
}

export function makePickableByName(scene, names, options = {}) {
  const targets = (Array.isArray(names) ? names : [names])
    .map(n => scene.getMeshByName(n) || scene.getTransformNodeByName(n))
    .filter(t => t);
  return makePickable(scene, targets, options);
}

// Make a GLB import pickable as a single object
// (handles the parent/child mess that GLB loaders create)
// export function makeImportedModelPickable(scene, importResult, options = {}) {
//   if (!importResult) {
//     console.warn('makeImportedModelPickable: no import result');
//     return null;
//   }

//   // Find the visible root mesh (highest vertex count)
//   let target = importResult.root;

//   // If the GLB has __root__ wrapper, try to use the actual content
//   if (target && target.name === '__root__' && target.getChildren) {
//     const realChild = target.getChildren().find(c => 
//       c.getTotalVertices && c.getTotalVertices() > 0
//     );
//     if (realChild) target = realChild;
//   }

//   if (!target) {
//     console.warn('makeImportedModelPickable: no usable target found');
//     return null;
//   }

//   // Bake transforms so dragging behaves correctly
//   if (target.bakeCurrentTransformIntoVertices && target instanceof BABYLON.Mesh) {
//     try {
//       target.bakeCurrentTransformIntoVertices();
//     } catch (e) {
//       console.warn('Could not bake transforms:', e.message);
//     }
//   }

//   setupOne(scene, target, options);
//   return target;
// }


export function makeImportedModelPickable(scene, importResult, options = {}) {
  if (!importResult?.root) {
    console.warn('makeImportedModelPickable: no import result');
    return null;
  }

  // Use the root TransformNode — moves all children together
  const target = importResult.root;
  
  // Mark all child meshes so they don't trigger surface detection
  importResult.meshes.forEach(m => {
    m._isPickupChild = true;
    if (m.material) m.isPickable = true;
  });

  setupOne(scene, target, options);
  console.log('✅ Pickup attached to', target.name);
  return target;
}

export function resetAllPickables(targets) {
  (Array.isArray(targets) ? targets : [targets]).forEach(t => {
    if (t && t._pickupOriginal) {
      t.position.copyFrom(t._pickupOriginal.position);
      t.rotation.copyFrom(t._pickupOriginal.rotation);
    }
  });
}