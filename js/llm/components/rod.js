// js/llm/components/rod.js — rigid rod (horizontal beam)
import { pbr, applyPos, castShadow } from './_shared.js';

export function rod(scene, props, ctx) {
  const p = props.params || {};
  const length = typeof p.length === 'number' ? p.length : 1.0;
  const diameter = typeof p.diameter === 'number' ? p.diameter : 0.04;
  const axis = p.axis || 'x'; // 'x' | 'y' | 'z'

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const mat = pbr(scene, `${props.id}_mat`, { albedo: '#888a90', metallic: 0.85, roughness: 0.3 });
  const mesh = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_mesh`, {
    diameter, height: length, tessellation: 16,
  }, scene);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.parent   = root;
  mesh.material = mat;
  castShadow(ctx.shadow, mesh);

  return {
    root,
    meshes: [mesh],
    anchors: {
      start: axisVec(axis, -length / 2),
      end:   axisVec(axis,  length / 2),
    },
    params: { length, diameter, axis },
  };
}

function axisVec(axis, d) {
  if (axis === 'x') return new BABYLON.Vector3(d, 0, 0);
  if (axis === 'y') return new BABYLON.Vector3(0, d, 0);
  return new BABYLON.Vector3(0, 0, d);
}
