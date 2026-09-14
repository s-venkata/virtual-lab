// js/llm/components/track.js — straight horizontal track (cart rail)
import { pbr, applyPos, castShadow } from './_shared.js';

export function track(scene, props, ctx) {
  const p = props.params || {};
  const length = typeof p.length === 'number' ? p.length : 3.0;
  const width  = typeof p.width  === 'number' ? p.width  : 0.4;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const benchMat = pbr(scene, `${props.id}_bench_mat`, { albedo: '#3a3a40', metallic: 0.7, roughness: 0.4 });
  const railMat  = pbr(scene, `${props.id}_rail_mat`,  { albedo: '#9a9aa2', metallic: 0.9, roughness: 0.2 });

  const bench = BABYLON.MeshBuilder.CreateBox(`${props.id}_bench`, {
    width: length, height: 0.06, depth: width,
  }, scene);
  bench.position.y = -0.03;
  bench.parent     = root;
  bench.material   = benchMat;
  castShadow(ctx.shadow, bench);

  const rails = [];
  [-width * 0.3, width * 0.3].forEach((zOff, i) => {
    const rail = BABYLON.MeshBuilder.CreateBox(`${props.id}_rail_${i}`, {
      width: length, height: 0.03, depth: 0.04,
    }, scene);
    rail.position.set(0, 0.015, zOff);
    rail.parent   = root;
    rail.material = railMat;
    rails.push(rail);
  });

  return {
    root,
    meshes: [bench, ...rails],
    anchors: {
      start:  new BABYLON.Vector3(-length / 2, 0, 0),
      end:    new BABYLON.Vector3( length / 2, 0, 0),
      center: new BABYLON.Vector3(0, 0, 0),
    },
    params: { length, width },
  };
}
