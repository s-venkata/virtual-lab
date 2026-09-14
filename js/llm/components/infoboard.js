// js/llm/components/infoboard.js — static info panel with multi-line text
import { applyPos, makeTextTexture } from './_shared.js';

export function infoboard(scene, props, ctx) {
  const p = props.params || {};
  const lines = Array.isArray(p.lines) ? p.lines : ['INFO'];
  const w = typeof p.width  === 'number' ? p.width  : 2.0;
  const h = typeof p.height === 'number' ? p.height : 1.0;
  const title = p.title || '';

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const tex = makeTextTexture(scene, `${props.id}_tex`, (c, W, H) => {
    c.fillStyle = '#0a1628';
    c.fillRect(0, 0, W, H);
    if (title) {
      c.fillStyle = '#00e5ff';
      c.font = 'bold 32px monospace';
      c.textAlign = 'center';
      c.fillText(title, W / 2, 44);
      c.strokeStyle = '#00e5ff44';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(40, 60); c.lineTo(W - 40, 60); c.stroke();
    }
    c.fillStyle = '#ffffff';
    c.font = '22px monospace';
    c.textAlign = 'left';
    let y = title ? 100 : 50;
    for (const line of lines) {
      c.fillText(line, 30, y);
      y += 30;
      if (y > H - 20) break;
    }
  }, { w: 600, h: 360 });

  const mat = new BABYLON.StandardMaterial(`${props.id}_mat`, scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;

  const panel = BABYLON.MeshBuilder.CreatePlane(`${props.id}_panel`,
    { width: w, height: h }, scene);
  panel.parent     = root;
  panel.material   = mat;
  panel.isPickable = false;

  return {
    root,
    meshes: [panel],
    params: { lines, width: w, height: h, title },
  };
}
