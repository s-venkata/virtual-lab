// js/llm/components/lens.js — convex/concave lens + frame + post
import { pbr, applyPos, castShadow } from './_shared.js';

export function lens(scene, props, ctx) {
  const p = props.params || {};
  const focal = typeof p.focal === 'number' ? p.focal : 1.5;
  const diameter = typeof p.diameter === 'number' ? p.diameter : 0.5;
  const kind = p.kind || 'convex'; // 'convex' | 'concave'
  const postHeight = typeof p.postHeight === 'number' ? p.postHeight : 0.7;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const glassMat = pbr(scene, `${props.id}_glass_mat`, {
    albedo: '#d8eef5', alpha: 0.45, metallic: 0.0, roughness: 0.05, backFaceCulling: false,
  });
  const frameMat = pbr(scene, `${props.id}_frame_mat`, {
    albedo: '#2a2a2e', metallic: 0.85, roughness: 0.3,
  });
  const standMat = pbr(scene, `${props.id}_stand_mat`, {
    albedo: '#3a3a40', metallic: 0.7, roughness: 0.4,
  });

  // Convex: caps bulge OUTWARD from the ring — front sphere faces +X, back faces -X.
  // Concave: caps bulge INWARD — front sphere faces -X, back faces +X (invert
  // via 180° flip so the visible cap comes from the far hemisphere).
  const isConcave = kind === 'concave';
  const sliceHeight = 0.18;

  const front = BABYLON.MeshBuilder.CreateSphere(`${props.id}_front`, {
    diameter, segments: 24, slice: sliceHeight,
  }, scene);
  front.parent     = root;
  front.rotation.z = isConcave ? Math.PI / 2 : -Math.PI / 2;
  front.material   = glassMat;

  const back = BABYLON.MeshBuilder.CreateSphere(`${props.id}_back`, {
    diameter, segments: 24, slice: sliceHeight,
  }, scene);
  back.parent     = root;
  back.rotation.z = isConcave ? -Math.PI / 2 : Math.PI / 2;
  back.material   = glassMat;

  const ring = BABYLON.MeshBuilder.CreateTorus(`${props.id}_ring`, {
    diameter, thickness: 0.025, tessellation: 36,
  }, scene);
  ring.parent     = root;
  ring.rotation.z = Math.PI / 2;
  ring.material   = frameMat;

  const post = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_post`, {
    diameter: 0.04, height: postHeight, tessellation: 12,
  }, scene);
  post.parent     = root;
  post.position.y = -postHeight / 2 - diameter / 2;
  post.material   = standMat;

  [front, back, ring].forEach(m => castShadow(ctx.shadow, m));

  return {
    root,
    meshes: [front, back, ring, post],
    anchors: { center: new BABYLON.Vector3(0, 0, 0) },
    state:  { focal },
    params: { focal, diameter, kind, postHeight },
  };
}
