// js/llm/components/ramp.js — inclined plane
import { pbr, applyPos, castShadow } from './_shared.js';

export function ramp(scene, props, ctx) {
  const p = props.params || {};
  const length = typeof p.length === 'number' ? p.length : 2.0;
  const width  = typeof p.width  === 'number' ? p.width  : 0.5;
  const angle  = typeof p.angle  === 'number' ? p.angle  : Math.PI / 8; // radians

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const mat = pbr(scene, `${props.id}_mat`, { albedo: '#5a4030', metallic: 0.2, roughness: 0.7 });
  const slope = BABYLON.MeshBuilder.CreateBox(`${props.id}_slope`, {
    width: length, height: 0.04, depth: width,
  }, scene);
  slope.rotation.z = angle;
  slope.position.y = (length / 2) * Math.sin(angle);
  slope.parent     = root;
  slope.material   = mat;
  castShadow(ctx.shadow, slope);

  return {
    root,
    meshes: [slope],
    anchors: {
      bottom: new BABYLON.Vector3(-length / 2 * Math.cos(angle), 0, 0),
      top:    new BABYLON.Vector3( length / 2 * Math.cos(angle), length * Math.sin(angle), 0),
    },
    params: { length, width, angle },
  };
}
