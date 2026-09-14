// js/llm/components/laser.js — emissive laser source
import { pbr, applyPos, castShadow } from './_shared.js';

export function laser(scene, props, ctx) {
  const p = props.params || {};
  const wavelength = p.wavelength || '650nm';
  const color = p.color || '#ff2244';
  const power = typeof p.power === 'number' ? p.power : 5;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const bodyMat = pbr(scene, `${props.id}_body_mat`, { albedo: '#222', metallic: 0.8, roughness: 0.3 });
  const portMat = pbr(scene, `${props.id}_port_mat`, {
    albedo: color, emissive: color, emissiveIntensity: power,
  });

  const body = BABYLON.MeshBuilder.CreateBox(`${props.id}_body`, {
    width: 0.32, height: 0.12, depth: 0.22,
  }, scene);
  body.parent   = root;
  body.material = bodyMat;
  castShadow(ctx.shadow, body);

  const port = BABYLON.MeshBuilder.CreateBox(`${props.id}_port`, {
    width: 0.04, height: 0.04, depth: 0.005,
  }, scene);
  port.position.z = 0.115;
  port.parent     = root;
  port.material   = portMat;

  return {
    root,
    meshes: [body, port],
    anchors: { exit: new BABYLON.Vector3(0, 0, 0.115) },
    state:  { on: true, color, power },
    params: { wavelength, color, power },
  };
}
