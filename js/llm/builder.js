// js/llm/builder.js
// Turns a validated experiment spec into a Babylon mesh tree.
//
// Output: { id, root, meshes, dispose, tick(dt), getState() }
//
// Process:
//   1. Topologically sort components by attach dependency (roots first).
//   2. For each component, dispatch to its factory (registry).
//   3. Resolve `attach` references using the ref's WORLD matrix so anchors
//      respect the ref's rotation (fixes bobs on rotated stands).
//   4. Wire draggable / constrain via js/llm/interactions.js.
//   5. Wire `physics.kind` to a solver and run it per-frame.
//   6. Compile `task.successWhen` to evaluate against a ref-context each frame.
//
// Determinism:
//   spec.startedAt (ms since epoch, server-stamped) is passed through the
//   ctx object so every solver can share a common t₀. Peers converge because
//   they all seed from the same startedAt rather than local performance.now().

import { getFactory } from './components/_registry.js';
import { compileExpr } from './exprEval.js';
import { makeComponentDraggable } from './interactions.js';

import { pendulumSolver }     from './physics/pendulum.js';
import { freefallSolver }     from './physics/freefall.js';
import { springMassSolver }   from './physics/springMass.js';
import { thinLensSolver }     from './physics/thinLens.js';
import { snellSolver }        from './physics/snell.js';
import { polarizationSolver } from './physics/polarization.js';

const SOLVERS = {
  'pendulum':     pendulumSolver,
  'freefall':     freefallSolver,
  'spring-mass':  springMassSolver,
  'thin-lens':    thinLensSolver,
  'snell':        snellSolver,
  'polarization': polarizationSolver,
  'none':         null,
};

export function buildExperiment(spec, scene, shadow, M, opts = {}) {
  const components = new Map();   // id → { props, root, meshes, anchors, state, params }
  const allMeshes  = [];
  const extraDisposers = [];      // interaction cleanups etc.

  // Deterministic time base — server stamps spec.startedAt; fall back to now.
  const startedAt = typeof spec.startedAt === 'number' && Number.isFinite(spec.startedAt)
    ? spec.startedAt
    : Date.now();

  const ctx = {
    scene, shadow, M,
    origin: spec.origin,
    components,
    startedAt,
    specId: spec.id,
    network: opts.network || null,
  };

  // ── Pass 0: topological order so chained attach (A→B→C) resolves ──
  const ordered = topoOrder(spec.components);

  // ── Pass 1: build each component in dependency order ──
  for (const props of ordered) {
    const factory = getFactory(props.type);
    if (!factory) {
      console.warn(`[llm builder] unknown type "${props.type}" — skipping`);
      continue;
    }
    let result;
    try {
      result = factory(scene, props, ctx);
    } catch (e) {
      console.error(`[llm builder] factory "${props.type}" id="${props.id}" failed:`, e);
      continue;
    }

    // Resolve `attach` — transform the ref's local anchor by its world matrix
    // so rotations on the ref are honoured. Then add any additional `pos`
    // offset as a relative delta (LLMs use `pos` as a nudge on top of attach).
    if (props.attach) {
      const [refId, anchorName] = props.attach.split('.');
      const ref = components.get(refId);
      if (ref) {
        const localAnchor = ref.anchors?.[anchorName] ?? ref.anchors?.center ?? BABYLON.Vector3.Zero();
        ref.root.computeWorldMatrix(true);
        const worldAnchor = BABYLON.Vector3.TransformCoordinates(localAnchor, ref.root.getWorldMatrix());
        result.root.position.copyFrom(worldAnchor);
        if (Array.isArray(props.pos)) {
          result.root.position.x += props.pos[0];
          result.root.position.y += props.pos[1];
          result.root.position.z += props.pos[2];
        }
      } else {
        console.warn(`[llm builder] attach target "${refId}" not found (component "${props.id}")`);
      }
    }

    components.set(props.id, { ...result, props });
    if (Array.isArray(result.meshes)) allMeshes.push(...result.meshes);
    if (result.root && !allMeshes.includes(result.root)) allMeshes.push(result.root);
  }

  // ── Pass 2: wire draggable / constrain ──
  // (Runs after all attach resolution so the initial position is final.)
  for (const props of spec.components) {
    if (!props.draggable) continue;
    const c = components.get(props.id);
    if (!c) continue;
    try {
      const disposer = makeComponentDraggable(scene, c, {
        constrain: props.constrain || 'none',
        origin: spec.origin,
        specId: spec.id,
        componentId: props.id,
        network: opts.network || null,
      });
      if (typeof disposer === 'function') extraDisposers.push(disposer);
    } catch (e) {
      console.warn(`[llm builder] draggable wire failed for "${props.id}":`, e);
    }
  }

  // ── Pass 3: physics solver ──
  let solver = null;
  let driverMissing = false;
  if (spec.physics && SOLVERS[spec.physics.kind]) {
    // Explicit driver-exists check for user-visible feedback
    if (spec.physics.drives && !components.has(spec.physics.drives)) {
      driverMissing = true;
      console.warn(`[llm builder] physics.drives "${spec.physics.drives}" has no matching component`);
    }
    if (!driverMissing) {
      try {
        solver = SOLVERS[spec.physics.kind](spec.physics, components, ctx);
      } catch (e) {
        console.error('[llm builder] solver init failed:', e);
      }
    }
  }

  // ── Pass 4: task success expression ──
  let successFn = null;
  if (spec.task && typeof spec.task.successWhen === 'string' && spec.task.successWhen.length) {
    try {
      successFn = compileExpr(spec.task.successWhen);
    } catch (e) {
      console.warn('[llm builder] successWhen compile failed:', e.message);
    }
  }

  // ── Pass 5: readouts + per-frame loop ──
  const readouts = [];
  for (const [, c] of components) {
    if (c.props?.type === 'readout' && c.state?.paint) readouts.push(c);
  }

  let lastT = performance.now();
  let lastReadoutPaint = 0;
  let succeeded = false;
  let successSign = null;   // tracked so dispose() can clean it up
  let observer = null;

  // Error surfacing — rate-limited so one bad frame doesn't spam
  const errState = { lastLog: 0, lastMsg: null };
  const logErr = (tag, msg) => {
    const now = performance.now();
    if (msg === errState.lastMsg && now - errState.lastLog < 2000) return;
    errState.lastMsg = msg;
    errState.lastLog = now;
    console.warn(`[llm builder ${tag}]`, msg);
  };

  // Show driver-missing message via readouts immediately
  if (driverMissing && readouts.length) {
    for (const r of readouts) {
      try { r.state.paint([`ERROR: physics.drives "${spec.physics.drives}" missing`], { title: 'Build error' }); } catch {}
    }
  }

  observer = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1; // clamp on tab focus

    if (solver && solver.tick) {
      try { solver.tick(dt); } catch (e) { logErr('solver.tick', e.message); }
    }

    if (solver?.getInfo && readouts.length && now - lastReadoutPaint > 200) {
      lastReadoutPaint = now;
      let info = null;
      try { info = solver.getInfo(); } catch (e) { logErr('solver.getInfo', e.message); }
      if (info && typeof info === 'object') {
        const lines = formatInfo(info);
        for (const r of readouts) {
          try { r.state.paint(lines, { title: r.params?.title }); } catch (e) { logErr('readout.paint', e.message); }
        }
      }
    }

    if (!succeeded && successFn) {
      try {
        const refCtx = buildRefCtx(components);
        const result = successFn(refCtx);
        if (result) {
          succeeded = true;
          successSign = showSuccess(scene, spec, ctx);
          if (successSign) allMeshes.push(successSign);
        }
      } catch (e) { logErr('successWhen', e.message); }
    }
  });

  function dispose() {
    if (observer) {
      scene.onBeforeRenderObservable.remove(observer);
      observer = null;
    }
    for (const d of extraDisposers) {
      try { d(); } catch {}
    }
    extraDisposers.length = 0;
    for (const c of components.values()) {
      // Textures / materials owned by the component state
      try { c.state?.tex?.dispose?.(); } catch {}
      try { c.state?.dispose?.(); } catch {}
      try { c.root?.dispose(false, true); } catch {}
    }
    if (successSign) {
      try { successSign.material?.getActiveTextures?.().forEach(t => t.dispose()); } catch {}
      try { successSign.material?.dispose?.(); } catch {}
      try { successSign.dispose(false, true); } catch {}
      successSign = null;
    }
    components.clear();
  }

  return {
    id: spec.id,
    spec,
    components,
    meshes: allMeshes,
    solver,
    dispose,
    getState: () => buildRefCtx(components),
  };
}

// ── Topological sort of components by `attach` dependency ────────────
function topoOrder(components) {
  const byId = new Map(components.map(c => [c.id, c]));
  const visited = new Set();
  const temp = new Set();
  const out = [];
  const visit = (c) => {
    if (!c || visited.has(c.id)) return;
    if (temp.has(c.id)) {
      // cycle — bail out and keep original order for the offender
      console.warn(`[llm builder] attach cycle at "${c.id}"`);
      return;
    }
    temp.add(c.id);
    if (c.attach) {
      const [refId] = c.attach.split('.');
      const ref = byId.get(refId);
      if (ref) visit(ref);
    }
    temp.delete(c.id);
    visited.add(c.id);
    out.push(c);
  };
  for (const c of components) visit(c);
  return out;
}

function buildRefCtx(components) {
  const ctx = {};
  for (const [id, c] of components) {
    ctx[id] = { ...(c.params || {}), ...(c.state || {}) };
  }
  return ctx;
}

function showSuccess(scene, spec, ctx) {
  const tex = new BABYLON.DynamicTexture(`${spec.id}_success_tex`,
    { width: 600, height: 160 }, scene, true);
  const c = tex.getContext();
  c.fillStyle = '#003300'; c.fillRect(0, 0, 600, 160);
  c.fillStyle = '#00ff88';
  c.font = 'bold 32px monospace';
  c.textAlign = 'center';
  c.fillText('✓ EXPERIMENT COMPLETE', 300, 60);
  c.fillStyle = '#aaffaa';
  c.font = '20px monospace';
  c.fillText(spec.task?.reward || spec.task?.goal || 'Goal achieved', 300, 110);
  tex.update();
  const mat = new BABYLON.StandardMaterial(`${spec.id}_success_mat`, scene);
  mat.emissiveTexture = tex; mat.diffuseTexture = tex; mat.disableLighting = true;
  const sign = BABYLON.MeshBuilder.CreatePlane(`${spec.id}_success_sign`,
    { width: 2.4, height: 0.65 }, scene);
  sign.material = mat;
  sign.position.set(ctx.origin[0], ctx.origin[1] + 2.4, ctx.origin[2]);
  sign.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
  sign.isPickable = false;
  return sign;
}

// ── Generic formatter for solver.getInfo() → readout lines ──────────────
function formatInfo(info) {
  const lines = [];
  for (const [k, v] of Object.entries(info)) {
    let s;
    if (v == null) s = '—';
    else if (typeof v === 'number') s = formatNumber(v);
    else if (typeof v === 'boolean') s = v ? 'yes' : 'no';
    else s = String(v);
    lines.push(`${k}: ${s}`);
  }
  return lines;
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const abs = Math.abs(n);
  if (abs === 0)        return '0';
  if (abs < 0.01)       return n.toExponential(2);
  if (abs < 100)        return n.toFixed(3);
  if (abs < 10000)      return n.toFixed(1);
  return n.toExponential(2);
}
