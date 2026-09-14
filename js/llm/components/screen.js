// js/llm/components/screen.js — projection screen with a DynamicTexture
import { applyPos, castShadow } from './_shared.js';

export function screenComp(scene, props, ctx) {
  const p = props.params || {};
  const w = typeof p.width  === 'number' ? p.width  : 0.7;
  const h = typeof p.height === 'number' ? p.height : 0.7;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const tex = new BABYLON.DynamicTexture(`${props.id}_tex`,
    { width: 512, height: 512 }, scene, true);
  const tctx = tex.getContext();
  tctx.fillStyle = '#222';
  tctx.fillRect(0, 0, 512, 512);
  tex.update();

  const mat = new BABYLON.StandardMaterial(`${props.id}_mat`, scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const panel = BABYLON.MeshBuilder.CreatePlane(`${props.id}_panel`,
    { width: w, height: h }, scene);
  panel.parent     = root;
  panel.material   = mat;
  panel.rotation.y = -Math.PI / 2; // face -X
  panel.isPickable = false;

  return {
    root,
    meshes: [panel],
    anchors: { center: new BABYLON.Vector3(0, 0, 0) },
    state:  { tex, dispose: () => { try { tex.dispose(); } catch {} try { mat.dispose(); } catch {} } }, // physics solvers can paint into this
    params: { width: w, height: h },
  };
}
