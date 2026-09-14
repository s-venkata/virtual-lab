// js/llm/physics/thinLens.js
// 1/f = 1/u + 1/v   m = v/u
// Computes image position on the screen given a draggable lens between
// a slide and a screen. Renders an inverted scaled letter on the screen.
//
// Identifies role by component types: needs one slide, one lens, one screen.
import { resolveValue } from '../exprEval.js';

export function thinLensSolver(spec, components, ctx) {
  const params = spec.params || {};
  // Locate roles
  let slide = null, lens = null, screen = null;
  for (const [, c] of components) {
    if (c.props.type === 'slide')  slide  = c;
    if (c.props.type === 'lens')   lens   = c;
    if (c.props.type === 'screen') screen = c;
  }
  if (!slide || !lens || !screen) {
    return { tick: () => {}, getInfo: () => ({ error: 'thin-lens needs slide, lens, screen' }) };
  }

  const refCtx = buildRefCtx(components);
  const f = resolveValue(params.f, refCtx) ?? lens.params.focal ?? 1.5;

  const tick = () => {
    const slideX  = slide.root.position.x;
    const lensX   = lens.root.position.x;
    const screenX = screen.root.position.x;
    const u = lensX - slideX;
    const vActual = screenX - lensX;
    let vCalc = Infinity, m = 0, real = false;
    if (u > f + 0.01) {
      vCalc = 1 / (1 / f - 1 / u);
      if (vCalc > 0 && isFinite(vCalc)) { m = vCalc / u; real = true; }
    }
    const error = real ? Math.abs(vActual - vCalc) : 999;
    const sharpness = real ? Math.max(0, 1 - error / 1.0) : 0;
    drawScreen(screen.state.tex, m, (1 - sharpness) * 12, 0.4 + sharpness * 0.6, real,
               slide.params?.text || 'F');

    // Expose live state
    const drivenId = spec.drives;
    if (drivenId && components.has(drivenId)) {
      const d = components.get(drivenId);
      d.state.u = u; d.state.v = vActual; d.state.vCalc = vCalc;
      d.state.magnification = m; d.state.sharpness = sharpness; d.state.imageReal = real;
    }
  };

  return {
    tick,
    getInfo: () => {
      const u = lens.root.position.x - slide.root.position.x;
      const v = screen.root.position.x - lens.root.position.x;
      let vCalc = Infinity, m = 0, real = false;
      if (u > f + 0.01) {
        vCalc = 1 / (1 / f - 1 / u);
        if (vCalc > 0 && isFinite(vCalc)) { m = vCalc / u; real = true; }
      }
      return { u, v, vCalc, magnification: m, focal: f, real };
    },
  };
}

function drawScreen(tex, m, blur, brightness, real, letter) {
  const c = tex.getContext();
  const W = tex.getSize().width;
  const H = tex.getSize().height;
  c.filter = 'none'; c.globalAlpha = 1;
  c.fillStyle = '#222'; c.fillRect(0, 0, W, H);
  if (!real) {
    c.fillStyle = '#888';
    c.font = '24px monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('— no real image —', W / 2, H / 2);
    tex.update();
    return;
  }
  c.save();
  c.translate(W / 2, H / 2);
  const visM = Math.max(-3.5, Math.min(3.5, -m));
  c.scale(visM, visM);
  c.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : 'none';
  c.globalAlpha = brightness;
  c.fillStyle = 'rgba(255,245,190,1)';
  c.font = 'bold 200px serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(letter, 0, 0);
  c.restore();
  c.filter = 'none'; c.globalAlpha = 1;
  tex.update();
}

function buildRefCtx(components) {
  const ctx = {};
  for (const [id, c] of components) {
    ctx[id] = { ...(c.params || {}), ...(c.state || {}) };
  }
  return ctx;
}
