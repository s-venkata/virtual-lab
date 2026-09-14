// js/llm/components/bob.js — pendulum bob / generic mass sphere
import { pbr, applyPos, castShadow } from './_shared.js';

export function bob(scene, props, ctx) {
  const p = props.params || {};
  const mass = typeof p.mass === 'number' ? p.mass : 0.5;
  const diameter = typeof p.diameter === 'number' ? p.diameter : 0.18;
  const color = p.color || '#cc4422';

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const mat = pbr(scene, `${props.id}_mat`, { albedo: color, metallic: 0.6, roughness: 0.3 });
  const mesh = BABYLON.MeshBuilder.CreateSphere(`${props.id}_mesh`, {
    diameter, segments: 24,
  }, scene);
  mesh.parent   = root;
  mesh.material = mat;
  castShadow(ctx.shadow, mesh);

  return {
    root,
    meshes: [mesh],
    anchors: {
      center: new BABYLON.Vector3(0, 0, 0),
      top:    new BABYLON.Vector3(0, diameter / 2, 0),
      bottom: new BABYLON.Vector3(0, -diameter / 2, 0),
    },
    state: {
      mass,
      angle: 0, angVel: 0,             // pendulum
      vy: 0, fellAt: null, hitAt: null, // freefall
      x: 0, vx: 0,                     // spring
    },
    params: { mass, diameter, color },
  };
}
