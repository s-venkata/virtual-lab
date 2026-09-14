// js/llm/components/label.js — billboarded text label
import { applyPos, makeTextTexture } from './_shared.js';

export function label(scene, props, ctx) {
  const p = props.params || {};
  const text = p.text || 'LABEL';
  const color = p.color || '#00e5ff';
  const w = typeof p.width  === 'number' ? p.width  : 0.6;
  const h = typeof p.height === 'number' ? p.height : 0.18;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const tex = makeTextTexture(scene, `${props.id}_tex`, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = color;
    c.font = `bold ${Math.floor(H * 0.42)}px monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, W / 2, H / 2);
  }, { w: 512, h: 128, alpha: true });

  const mat = new BABYLON.StandardMaterial(`${props.id}_mat`, scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;

  const plane = BABYLON.MeshBuilder.CreatePlane(`${props.id}_plane`,
    { width: w, height: h }, scene);
  plane.parent     = root;
  plane.material   = mat;
  plane.isPickable = false;
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;

  return {
    root,
    meshes: [plane],
    params: { text, color, width: w, height: h },
  };
}
