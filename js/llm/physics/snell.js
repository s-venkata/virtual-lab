// js/llm/physics/snell.js
// n1 sin(θ1) = n2 sin(θ2). v1: just exposes refraction angle as state on `drives`.
import { resolveValue } from '../exprEval.js';

export function snellSolver(spec, components, ctx) {
  const params = spec.params || {};
  const drivesId = spec.drives;
  const driven = components.get(drivesId);
  if (!driven) return { tick: () => {}, getInfo: () => ({ error: `snell: ${drivesId} missing` }) };

  const refCtx = buildRefCtx(components);
  const n1 = resolveValue(params.n1, refCtx) ?? 1.0;
  const n2 = resolveValue(params.n2, refCtx) ?? 1.5;
  const theta1deg = resolveValue(params.theta1, refCtx) ?? 30;

  const t1 = (theta1deg * Math.PI) / 180;
  const sinT2 = (n1 / n2) * Math.sin(t1);
  let t2 = NaN;
  if (Math.abs(sinT2) <= 1) t2 = Math.asin(sinT2);

  driven.state.theta1 = t1;
  driven.state.theta2 = t2;
  driven.state.tir = isNaN(t2);

  return {
    tick: () => {},
    getInfo: () => ({
      n1, n2,
      theta1deg,
      theta2deg: isNaN(t2) ? null : (t2 * 180) / Math.PI,
      totalInternalReflection: isNaN(t2),
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
