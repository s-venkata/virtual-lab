// js/llm/components/string.js — thin tether between two anchors
// Renders as a thin cylinder; physics solver may modify its endpoints.
import { pbr, applyPos } from './_shared.js';

export function stringComp(scene, props, ctx) {
  const p = props.params || {};
  const length = typeof p.length === 'number' ? p.length : 1.0;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const mat = pbr(scene, `${props.id}_mat`, { albedo: '#cccccc', metallic: 0.0, roughness: 0.9 });
  const mesh = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_mesh`, {
    diameter: 0.012, height: length, tessellation: 8,
  }, scene);
  // Hang downward by default — top at root origin, bottom at y = -length
  mesh.position.y = -length / 2;
  mesh.parent     = root;
  mesh.material   = mat;
  mesh.isPickable = false;

  return {
    root,
    meshes: [mesh],
    anchors: {
      top: new BABYLON.Vector3(0, 0, 0),
      end: new BABYLON.Vector3(0, -length, 0),
    },
    state: { length },
    params: { length },
  };
}
