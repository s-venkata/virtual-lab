// js/llm/components/photodetector.js — receiver with face + LED + readout
import { pbr, applyPos, castShadow } from './_shared.js';

export function photodetector(scene, props, ctx) {
  const p = props.params || {};
  const color = p.color || '#33ff77';

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const bodyMat = pbr(scene, `${props.id}_body_mat`, { albedo: '#222', metallic: 0.8, roughness: 0.3 });
  const faceMat = pbr(scene, `${props.id}_face_mat`, {
    albedo: color, emissive: color, emissiveIntensity: 0,
  });
  const ledMat = pbr(scene, `${props.id}_led_mat`, {
    albedo: '#222', emissive: '#222', emissiveIntensity: 0,
  });

  const body = BABYLON.MeshBuilder.CreateBox(`${props.id}_body`, {
    width: 0.32, height: 0.16, depth: 0.22,
  }, scene);
  body.parent   = root;
  body.material = bodyMat;
  castShadow(ctx.shadow, body);

  const face = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_face`, {
    diameter: 0.08, height: 0.012, tessellation: 24,
  }, scene);
  face.rotation.x = Math.PI / 2;
  face.position.z = -0.115;
  face.parent     = root;
  face.material   = faceMat;

  const led = BABYLON.MeshBuilder.CreateSphere(`${props.id}_led`, {
    diameter: 0.015, segments: 12,
  }, scene);
  led.position.set(0.12, 0.05, -0.08);
  led.parent   = root;
  led.material = ledMat;

  return {
    root,
    meshes: [body, face, led],
    anchors: { face: new BABYLON.Vector3(0, 0, -0.115) },
    state:  { receiving: false, faceMat, ledMat },
    params: { color },
  };
}
