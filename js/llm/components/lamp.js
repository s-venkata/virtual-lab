// js/llm/components/lamp.js — light source for optics experiments
import { pbr, applyPos, castShadow } from './_shared.js';

export function lamp(scene, props, ctx) {
  const p = props.params || {};
  const color = p.color || '#fff5d8';
  const intensity = typeof p.intensity === 'number' ? p.intensity : 4.0;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const bodyMat = pbr(scene, `${props.id}_body_mat`, { albedo: '#2c2c30', metallic: 0.7, roughness: 0.4 });
  const body = BABYLON.MeshBuilder.CreateBox(`${props.id}_body`, {
    width: 0.3, height: 0.3, depth: 0.3,
  }, scene);
  body.parent   = root;
  body.material = bodyMat;
  castShadow(ctx.shadow, body);

  const glowMat = pbr(scene, `${props.id}_glow_mat`, {
    albedo: color, emissive: color, emissiveIntensity: intensity,
    metallic: 0.0, roughness: 0.5,
  });
  const face = BABYLON.MeshBuilder.CreateDisc(`${props.id}_face`, {
    radius: 0.1, tessellation: 24,
  }, scene);
  face.position.x  = 0.16;
  face.rotation.y  = Math.PI / 2;
  face.parent      = root;
  face.material    = glowMat;

  const point = new BABYLON.PointLight(`${props.id}_pl`,
    new BABYLON.Vector3(0, 0, 0), scene);
  point.intensity = 0.4;
  point.range     = 1.5;
  point.diffuse   = BABYLON.Color3.FromHexString(color);
  point.parent    = root;
  point.position  = new BABYLON.Vector3(0.4, 0, 0);

  return {
    root,
    meshes: [body, face],
    anchors: { exit: new BABYLON.Vector3(0.16, 0, 0) },
    state:  { on: true, color, intensity },
    params: { color, intensity },
  };
}
