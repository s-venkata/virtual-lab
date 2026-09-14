// js/llm/physics/pendulum.js
// Simple pendulum: θ'' = -(g/L) sin θ
// Drives a "bob" component, optionally rotates a "string" component.
//
// Physics params (resolved against ctx):
//   g       (default 9.81)
//   length  (default: drives.string.length if present, else 1.0)
//   damping (default 0.005)
//   initialAngle (default 0.5 rad)
//
// Determinism:
//   - Uses ctx.startedAt (epoch ms) for zero-crossing timing so peers converge.

import { resolveValue } from '../exprEval.js';

export function pendulumSolver(spec, components, ctx) {
  const params = spec.params || {};
  const drivesId = spec.drives;
  const driven = components.get(drivesId);
  if (!driven) throw new Error(`pendulum: drives "${drivesId}" not found`);

  // Find string component if any
  let stringComp = null;
  for (const [, c] of components) {
    if (c.props && c.props.type === 'string') { stringComp = c; break; }
  }

  const refCtx = buildRefCtx(components);
  const g       = resolveValue(params.g, refCtx) ?? 9.81;
  const length  = resolveValue(params.length, refCtx) ?? (stringComp?.params?.length ?? 1.0);
  const damping = resolveValue(params.damping, refCtx) ?? 0.005;
  const initialAngle = resolveValue(params.initialAngle, refCtx) ?? 0.5;

  driven.state.angle  = initialAngle;
  driven.state.angVel = 0;
  driven.state.length = length;

  // Track period for analysis — use shared epoch (ctx.startedAt) so peers agree
  const startedAt = typeof ctx.startedAt === 'number' ? ctx.startedAt : Date.now();
  let lastZeroCross = null;   // ms since startedAt
  const measuredPeriods = [];
  const _tmpPivot = new BABYLON.Vector3();

  function getPivot() {
    // Live world-space pivot from the string root; falls back to the bob's
    // parent origin so a mis-authored spec still runs.
    if (stringComp) {
      stringComp.root.computeWorldMatrix(true);
      _tmpPivot.copyFrom(stringComp.root.absolutePosition);
      return _tmpPivot;
    }
    _tmpPivot.set(ctx.origin[0], ctx.origin[1] + length, ctx.origin[2]);
    return _tmpPivot;
  }

  const tick = (dt) => {
    const a = -(g / length) * Math.sin(driven.state.angle);
    driven.state.angVel += a * dt;
    driven.state.angVel *= (1 - damping);
    const prevAngle = driven.state.angle;
    driven.state.angle += driven.state.angVel * dt;

    // Position bob below the LIVE pivot each frame (so moving the stand works)
    const pivot = getPivot();
    const x = pivot.x + length * Math.sin(driven.state.angle);
    const y = pivot.y - length * Math.cos(driven.state.angle);
    const z = pivot.z;
    driven.root.position.set(x, y, z);

    // Rotate string visually if present
    if (stringComp) {
      stringComp.root.rotation.z = driven.state.angle;
    }

    // Period measurement (zero crossings, going positive) using shared t₀
    if (prevAngle <= 0 && driven.state.angle > 0) {
      const nowMs = Date.now() - startedAt;
      if (lastZeroCross != null) {
        measuredPeriods.push((nowMs - lastZeroCross) / 1000);
        if (measuredPeriods.length > 5) measuredPeriods.shift();
        const avg = measuredPeriods.reduce((s, x) => s + x, 0) / measuredPeriods.length;
        driven.state.measuredPeriod = avg;
      }
      lastZeroCross = nowMs;
    }
  };

  return {
    tick,
    getInfo: () => ({
      angle:           driven.state.angle,
      angVel:          driven.state.angVel,
      length,
      g,
      theoreticalT:    2 * Math.PI * Math.sqrt(length / g),
      measuredPeriod:  driven.state.measuredPeriod ?? null,
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
