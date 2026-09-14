// js/llm/physics/freefall.js
// Galileo-style free fall: y'' = -g, with an optional ground at y=groundY.
// Drives a "bob" or "cart" component vertically.
//
// Determinism:
//   fellAt is offset from ctx.startedAt (epoch ms) rather than local
//   performance.now(), so peers agree on hit time even when they join late.

import { resolveValue } from '../exprEval.js';

export function freefallSolver(spec, components, ctx) {
  const params = spec.params || {};
  const drivesId = spec.drives;
  const driven = components.get(drivesId);
  if (!driven) throw new Error(`freefall: drives "${drivesId}" not found`);

  const refCtx = buildRefCtx(components);
  const g       = resolveValue(params.g, refCtx) ?? 9.81;
  const groundY = resolveValue(params.groundY, refCtx) ?? (ctx.origin?.[1] ?? 0);
  const startY  = resolveValue(params.startY, refCtx) ?? driven.root.position.y;

  const startedAt = typeof ctx.startedAt === 'number' ? ctx.startedAt : Date.now();

  driven.state.vy = 0;
  driven.state.fellAt = 0;                 // ms since startedAt
  driven.state.hitAt  = null;              // ms since startedAt (null until landing)
  driven.root.position.y = startY;

  // If we're joining late (startedAt in the past), pre-integrate up to
  // Math.min(elapsed, hit-time) so peers see the ball at the right place.
  const initialElapsed = Math.max(0, (Date.now() - startedAt) / 1000);
  if (initialElapsed > 0) {
    // analytic: y(t) = startY - 0.5 g t²   until y hits groundY at tHit
    const tHit = Math.sqrt(Math.max(0, 2 * (startY - groundY) / g));
    const t = Math.min(initialElapsed, tHit);
    driven.root.position.y = Math.max(groundY, startY - 0.5 * g * t * t);
    driven.state.vy = -g * t;
    if (initialElapsed >= tHit) {
      driven.state.hitAt = tHit * 1000;
      driven.state.vy = 0;
      driven.root.position.y = groundY;
    }
  }

  const tick = (dt) => {
    if (driven.state.hitAt != null) return;
    driven.state.vy += -g * dt;
    driven.root.position.y += driven.state.vy * dt;
    if (driven.root.position.y <= groundY) {
      driven.root.position.y = groundY;
      driven.state.vy = 0;
      driven.state.hitAt = Date.now() - startedAt;
    }
  };

  return {
    tick,
    getInfo: () => {
      const nowMs = Date.now() - startedAt;
      const fallTime = driven.state.hitAt != null
        ? driven.state.hitAt / 1000
        : nowMs / 1000;
      const h = startY - groundY;
      return {
        height: h,
        g,
        velocityNow: driven.state.vy,
        fallTime,
        theoreticalT: Math.sqrt(2 * h / g),
        landed: driven.state.hitAt != null,
      };
    },
    reset: () => {
      driven.state.vy = 0;
      driven.state.fellAt = 0;
      driven.state.hitAt  = null;
      driven.root.position.y = startY;
    },
  };
}

function buildRefCtx(components) {
  const ctx = {};
  for (const [id, c] of components) {
    ctx[id] = { ...(c.params || {}), ...(c.state || {}) };
  }
  return ctx;
}
