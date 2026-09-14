// js/llm/components/readout.js — live data panel updated by the physics solver
import { applyPos } from './_shared.js';

export function readout(scene, props, ctx) {
  const p = props.params || {};
  const w = typeof p.width  === 'number' ? p.width  : 1.6;
  const h = typeof p.height === 'number' ? p.height : 0.9;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const TEX_W = 600, TEX_H = 360;
  const tex = new BABYLON.DynamicTexture(`${props.id}_tex`,
    { width: TEX_W, height: TEX_H }, scene, true);

  const mat = new BABYLON.StandardMaterial(`${props.id}_mat`, scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;   // visible from any angle (avoids billboard back-face flip)

  const panel = BABYLON.MeshBuilder.CreatePlane(`${props.id}_panel`,
    { width: w, height: h }, scene);
  panel.parent   = root;
  panel.material = mat;
  panel.isPickable = false;
  panel.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;

  function paint(lines, opts = {}) {
    const c = tex.getContext();
    c.fillStyle = opts.bg || '#0a1628';
    c.fillRect(0, 0, TEX_W, TEX_H);
    c.fillStyle = '#00e5ff';
    c.font = 'bold 24px monospace';
    c.textAlign = 'left';
    c.fillText(opts.title || (props.params?.title || 'LIVE DATA'), 20, 32);
    c.fillStyle = '#333';
    c.fillRect(20, 44, TEX_W - 40, 1);
    c.font = '20px monospace';
    c.fillStyle = '#ffffff';
    let y = 80;
    for (const line of lines) {
      c.fillText(line, 20, y);
      y += 30;
      if (y > TEX_H - 20) break;
    }
    tex.update();
  }
  paint(['Awaiting data…']);

  return {
    root,
    meshes: [panel],
    state:  { paint, tex, dispose: () => { try { tex.dispose(); } catch {} try { mat.dispose(); } catch {} } },
    params: { width: w, height: h, title: p.title || 'LIVE DATA' },
  };
}
