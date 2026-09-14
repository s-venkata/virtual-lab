// js/llm/components/slide.js — emissive slide carrying an "object" texture
import { applyPos, makeTextTexture } from './_shared.js';

export function slide(scene, props, ctx) {
  const p = props.params || {};
  const text = p.text || 'F';
  const color = p.color || '#fff8b0';
  const w = typeof p.width  === 'number' ? p.width  : 0.32;
  const h = typeof p.height === 'number' ? p.height : 0.32;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const tex = makeTextTexture(scene, `${props.id}_tex`, (ctx2, W, H) => {
    ctx2.fillStyle = '#000'; ctx2.fillRect(0, 0, W, H);
    ctx2.fillStyle = color;
    ctx2.font = `bold ${Math.floor(H * 0.78)}px serif`;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillText(text, W / 2, H / 2);
  }, { w: 256, h: 256 });

  const mat = new BABYLON.StandardMaterial(`${props.id}_mat`, scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const plane = BABYLON.MeshBuilder.CreatePlane(`${props.id}_plane`, { width: w, height: h }, scene);
  plane.parent     = root;
  plane.material   = mat;
  plane.rotation.y = -Math.PI / 2; // face +X by default
  plane.isPickable = false;

  return {
    root,
    meshes: [plane],
    anchors: { center: new BABYLON.Vector3(0, 0, 0) },
    params: { text, color, width: w, height: h },
  };
}
