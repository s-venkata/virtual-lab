// js/llm/components/prism.js — equilateral triangular prism
import { pbr, applyPos, castShadow } from './_shared.js';

export function prism(scene, props, ctx) {
  const p = props.params || {};
  const size   = typeof p.size   === 'number' ? p.size   : 0.3;
  const length = typeof p.length === 'number' ? p.length : 0.4;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const mat = pbr(scene, `${props.id}_mat`, {
    albedo: '#dde6f5', alpha: 0.5, metallic: 0.0, roughness: 0.05, backFaceCulling: false,
  });

  const mesh = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_mesh`, {
    diameter: size, height: length, tessellation: 3,
  }, scene);
  mesh.rotation.x = Math.PI / 2;
  mesh.parent     = root;
  mesh.material   = mat;
  castShadow(ctx.shadow, mesh);

  return {
    root,
    meshes: [mesh],
    anchors: { center: new BABYLON.Vector3(0, 0, 0) },
    params: { size, length },
  };
}
