// js/llm/components/stand.js — vertical post + base plate (anchor for hanging things)
import { pbr, applyPos, castShadow } from './_shared.js';

export function stand(scene, props, ctx) {
  const p = props.params || {};
  const height = typeof p.height === 'number' ? p.height : 2.0;
  const baseSize = typeof p.baseSize === 'number' ? p.baseSize : 0.4;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const mat  = pbr(scene, `${props.id}_mat`, { albedo: '#3a3a40', metallic: 0.7, roughness: 0.4 });
  const post = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_post`, {
    diameter: 0.05, height, tessellation: 16,
  }, scene);
  post.position.y = height / 2;
  post.parent     = root;
  post.material   = mat;
  castShadow(ctx.shadow, post);

  const base = BABYLON.MeshBuilder.CreateBox(`${props.id}_base`, {
    width: baseSize, height: 0.04, depth: baseSize,
  }, scene);
  base.position.y = 0.02;
  base.parent     = root;
  base.material   = mat;
  castShadow(ctx.shadow, base);

  return {
    root,
    meshes: [post, base],
    anchors: {
      base: new BABYLON.Vector3(0, 0, 0),
      top:  new BABYLON.Vector3(0, height, 0),
    },
    params: { height, baseSize },
  };
}
