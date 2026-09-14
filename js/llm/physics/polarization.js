// js/llm/physics/polarization.js
// Malus's law: I = I0 cos²(Δθ). Updates a photodetector's brightness.
import { resolveValue } from '../exprEval.js';

export function polarizationSolver(spec, components, ctx) {
  const params = spec.params || {};
  // Find a polarizer and a photodetector (or anything with faceMat in state)
  let pol = null, pd = null;
  for (const [, c] of components) {
    if (c.props.type === 'polarizer') pol = c;
    if (c.props.type === 'photodetector') pd = c;
  }
  if (!pol) return { tick: () => {}, getInfo: () => ({ error: 'no polarizer' }) };

  const refCtx = buildRefCtx(components);
  const sourceAngle = resolveValue(params.sourceAngle, refCtx) ?? 0;
  const I0 = resolveValue(params.I0, refCtx) ?? 1.0;

  const tick = () => {
    const polAngleDeg = pol.state.angle ?? 0;
    const dRad = ((polAngleDeg - sourceAngle) * Math.PI) / 180;
    const I = I0 * Math.cos(dRad) * Math.cos(dRad);
    pol.state.intensity = I;
    if (pd && pd.state.faceMat) {
      pd.state.faceMat.emissiveIntensity = 6 * I;
    }
  };

  return {
    tick,
    getInfo: () => ({
      polAngle: pol.state.angle,
      sourceAngle,
      transmittance: pol.state.intensity ?? 0,
    }),
  };
}

function buildRefCtx(components) {
  const ctx = {};
  for (const [id, c] of components) {
    ctx[id] = { ...(c.params || {}), ...(c.state || {}) };
  }
  return ctx;
}
