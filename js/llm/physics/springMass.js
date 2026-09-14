// js/llm/physics/springMass.js
// Hooke's-law spring: F = -k(x - rest), drives a bob/cart along Y.
// Recomputes anchor each tick so the rig can move. Also drives the spring's
// visual stretch via spring.state.setLength().
import { resolveValue } from '../exprEval.js';

export function springMassSolver(spec, components, ctx) {
  const params = spec.params || {};
  const drivesId = spec.drives;
  const driven = components.get(drivesId);
  if (!driven) throw new Error(`spring-mass: drives "${drivesId}" not found`);

  // Locate spring component if present
  let springC = null;
  for (const [, c] of components) {
    if (c.props && c.props.type === 'spring') { springC = c; break; }
  }

  const refCtx = buildRefCtx(components);
  const k       = resolveValue(params.k, refCtx) ?? (springC?.params?.k ?? 20);
  const restLen = resolveValue(params.restLength, refCtx) ?? (springC?.params?.restLength ?? 0.6);
  const m       = resolveValue(params.mass, refCtx) ?? (driven.params?.mass ?? 0.5);
  const damping = resolveValue(params.damping, refCtx) ?? 0.05;
  const startStretch = resolveValue(params.startStretch, refCtx) ?? 0.15;

  driven.state.vx = 0;
  driven.state.x  = restLen + startStretch;
  driven.state.mass = m;

  const _tmpAnchor = new BABYLON.Vector3();
  function getAnchor() {
    if (springC) {
      springC.root.computeWorldMatrix(true);
      _tmpAnchor.copyFrom(springC.root.absolutePosition);
    } else {
      _tmpAnchor.copyFrom(driven.root.absolutePosition);
    }
    return _tmpAnchor;
  }

  const tick = (dt) => {
    const stretch = driven.state.x - restLen;
    const a = (-k * stretch) / m;
    driven.state.vx += a * dt;
    driven.state.vx *= (1 - damping);
    driven.state.x  += driven.state.vx * dt;

    // Hang bob below the LIVE anchor
    const anchor = getAnchor();
    driven.root.position.set(anchor.x, anchor.y - driven.state.x, anchor.z);

    // Stretch spring visual
    if (springC?.state?.setLength) {
      try { springC.state.setLength(driven.state.x); } catch {}
    }
  };

  return {
    tick,
    getInfo: () => ({
      length: driven.state.x,
      v: driven.state.vx,
      k, mass: m,
      theoreticalT: 2 * Math.PI * Math.sqrt(m / k),
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
