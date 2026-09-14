// js/llm/components/fiber.js — straight-line fiber tube between two endpoints
import { pbr, applyPos } from './_shared.js';

export function fiber(scene, props, ctx) {
  const p = props.params || {};
  const length = typeof p.length === 'number' ? p.length : 1.0;
  const color  = p.color || '#ff3344';

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const mat = pbr(scene, `${props.id}_mat`, {
    albedo: '#0a0a0c', emissive: color, emissiveIntensity: 0, metallic: 0.0, roughness: 0.4,
  });

  const mesh = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_mesh`, {
    diameter: 0.024, height: length, tessellation: 12,
  }, scene);
  mesh.rotation.z = Math.PI / 2;
  mesh.parent     = root;
  mesh.material   = mat;
  mesh.isPickable = false;

  return {
    root,
    meshes: [mesh],
    anchors: {
      a: new BABYLON.Vector3(-length / 2, 0, 0),
      b: new BABYLON.Vector3( length / 2, 0, 0),
    },
    state:  { mat },
    params: { length, color },
  };
}
