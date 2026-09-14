// js/llm/components/mirror.js — flat mirror panel
import { pbr, applyPos, castShadow } from './_shared.js';

export function mirror(scene, props, ctx) {
  const p = props.params || {};
  const w = typeof p.width  === 'number' ? p.width  : 0.5;
  const h = typeof p.height === 'number' ? p.height : 0.5;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const surfMat = pbr(scene, `${props.id}_surf_mat`, {
    albedo: '#f0f0f0', metallic: 0.95, roughness: 0.05,
  });
  const frameMat = pbr(scene, `${props.id}_frame_mat`, {
    albedo: '#2a2a2e', metallic: 0.85, roughness: 0.3,
  });

  const surface = BABYLON.MeshBuilder.CreatePlane(`${props.id}_surf`, { width: w, height: h }, scene);
  surface.material = surfMat;
  surface.parent   = root;
  castShadow(ctx.shadow, surface);

  const frame = BABYLON.MeshBuilder.CreateBox(`${props.id}_frame`, {
    width: w + 0.05, height: h + 0.05, depth: 0.04,
  }, scene);
  frame.position.z = -0.025;
  frame.material   = frameMat;
  frame.parent     = root;

  return {
    root,
    meshes: [surface, frame],
    anchors: { center: new BABYLON.Vector3(0, 0, 0) },
    params: { width: w, height: h },
  };
}
