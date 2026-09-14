// js/llm/components/cart.js — block on wheels for tracks/ramps
import { pbr, applyPos, castShadow } from './_shared.js';

export function cart(scene, props, ctx) {
  const p = props.params || {};
  const mass = typeof p.mass === 'number' ? p.mass : 1.0;
  const w = typeof p.width  === 'number' ? p.width  : 0.25;
  const h = typeof p.height === 'number' ? p.height : 0.12;
  const d = typeof p.depth  === 'number' ? p.depth  : 0.18;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const body = BABYLON.MeshBuilder.CreateBox(`${props.id}_body`, { width: w, height: h, depth: d }, scene);
  body.position.y = h / 2;
  body.parent   = root;
  body.material = pbr(scene, `${props.id}_body_mat`, { albedo: p.color || '#ee5544', metallic: 0.4, roughness: 0.4 });
  castShadow(ctx.shadow, body);

  const wheelMat = pbr(scene, `${props.id}_wheel_mat`, { albedo: '#222222', metallic: 0.2, roughness: 0.7 });
  const wheels = [];
  const wx = w * 0.4, wz = d * 0.45;
  [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]].forEach(([x, z], i) => {
    const wheel = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_wheel_${i}`, {
      diameter: 0.06, height: 0.02, tessellation: 12,
    }, scene);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.03, z);
    wheel.parent   = root;
    wheel.material = wheelMat;
    wheels.push(wheel);
  });

  return {
    root,
    meshes: [body, ...wheels],
    anchors: { top: new BABYLON.Vector3(0, h, 0) },
    state:  { mass, x: 0, vx: 0 },
    params: { mass, width: w, height: h, depth: d },
  };
}
