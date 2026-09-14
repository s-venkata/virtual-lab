// js/llm/components/slider.js — placeholder slider (visual only for v1)
import { pbr, applyPos } from './_shared.js';

export function slider(scene, props, ctx) {
  const p = props.params || {};
  const length = typeof p.length === 'number' ? p.length : 0.4;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const railMat   = pbr(scene, `${props.id}_rail_mat`,   { albedo: '#888', metallic: 0.9, roughness: 0.2 });
  const handleMat = pbr(scene, `${props.id}_handle_mat`, { albedo: '#00e5ff', emissive: '#00e5ff', emissiveIntensity: 0.6 });

  const rail = BABYLON.MeshBuilder.CreateBox(`${props.id}_rail`, {
    width: length, height: 0.02, depth: 0.04,
  }, scene);
  rail.parent   = root;
  rail.material = railMat;

  const handle = BABYLON.MeshBuilder.CreateBox(`${props.id}_handle`, {
    width: 0.05, height: 0.05, depth: 0.06,
  }, scene);
  handle.position.y = 0.04;
  handle.parent     = root;
  handle.material   = handleMat;

  return {
    root,
    meshes: [rail, handle],
    state:  { value: 0.5 },
    params: { length },
  };
}
