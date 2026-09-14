// js/llm/components/spring.js — coil spring (visual + length state)
// Regenerates the helix path each time `state.setLength(x)` is called so
// the coil visibly stretches with the driven bob.
import { pbr, applyPos } from './_shared.js';

export function spring(scene, props, ctx) {
  const p = props.params || {};
  const restLength = typeof p.restLength === 'number' ? p.restLength : 0.6;
  const k          = typeof p.k === 'number' ? p.k : 20;
  const coils      = typeof p.coils === 'number' ? p.coils : 12;
  const radius     = typeof p.radius === 'number' ? p.radius : 0.06;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const mat = pbr(scene, `${props.id}_mat`, { albedo: '#aaaaaa', metallic: 0.9, roughness: 0.2 });

  const segments = coils * 16;
  function pathFor(length) {
    const pts = new Array(segments + 1);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * coils * 2 * Math.PI;
      pts[i] = new BABYLON.Vector3(
        Math.cos(angle) * radius,
        -t * length,
        Math.sin(angle) * radius
      );
    }
    return pts;
  }

  let mesh = BABYLON.MeshBuilder.CreateTube(`${props.id}_mesh`, {
    path: pathFor(restLength), radius: 0.012, tessellation: 8, updatable: true,
  }, scene);
  mesh.parent     = root;
  mesh.material   = mat;
  mesh.isPickable = false;

  let currentLength = restLength;
  function setLength(newLength) {
    if (!Number.isFinite(newLength) || newLength <= 0) return;
    if (Math.abs(newLength - currentLength) < 1e-4) return;
    currentLength = newLength;
    // CreateTube with `instance` argument does an in-place update — cheap.
    try {
      mesh = BABYLON.MeshBuilder.CreateTube(`${props.id}_mesh`, {
        path: pathFor(newLength), radius: 0.012, tessellation: 8, updatable: true, instance: mesh,
      }, scene);
    } catch {
      // Fallback: scale Y (cheap, less accurate)
      mesh.scaling.y = newLength / restLength;
    }
  }

  return {
    root,
    meshes: [mesh],
    anchors: {
      top: new BABYLON.Vector3(0, 0, 0),
      end: new BABYLON.Vector3(0, -restLength, 0),
    },
    state: { length: restLength, restLength, k, setLength },
    params: { restLength, k, coils, radius },
  };
}
