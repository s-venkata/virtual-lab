// js/llm/runtime.js
// Manages the lifecycle of LLM-generated experiments inside the aiLab room.
//
// Responsibilities:
//   - Spawn experiments from a validated spec (local + broadcast)
//   - Listen for spec broadcasts from Colyseus and mirror them locally
//   - Remove experiments and dispose meshes cleanly
//   - Re-parent generated meshes onto the aiLab room root (via roomManager)
//   - Preserve spec.startedAt (server-stamped) so all peers share t₀
//
// Public API:
//   const runtime = createExperimentRuntime({ scene, shadow, M, roomManager,
//                                              network });
//   runtime.attachToNetwork();         // call once after Colyseus is connected
//   runtime.spawnFromPrompt(prompt);   // POST /api/generate, then spawn
//   runtime.spawnLocal(spec);          // build + broadcast
//   runtime.remove(id);
//   runtime.list();
//   runtime.dispose();                 // teardown (scene disposal path)

import { buildExperiment } from './builder.js';
import { validateSpec }    from './schema.js';
import { generateSpec }    from './client.js';

export function createExperimentRuntime(opts) {
  const { scene, shadow, M, roomManager, network } = opts;
  const active = new Map(); // id → built handle
  let _attached = false;

  function _disposeHandle(handle) {
    try { handle.dispose(); } catch (e) { console.warn('[exp runtime] dispose error:', e); }
  }

  function spawnLocal(spec) {
    const v = validateSpec(spec);
    if (!v.ok) {
      console.warn('[exp runtime] invalid spec:', v.errors);
      return { ok: false, errors: v.errors };
    }

    // Replace-only: dispose ALL currently-active experiments before spawning
    // the new one. Matches user expectation that "generate again clears
    // the previous one." Tells peers to clear theirs too (except the one
    // we're about to spawn, which they'll rebuild from the broadcast).
    for (const [oldId, oldHandle] of [...active]) {
      _disposeHandle(oldHandle);
      active.delete(oldId);
      if (network?.removeExperiment && oldId !== spec.id) {
        network.removeExperiment(oldId);
      }
    }

    let built;
    try {
      built = buildExperiment(spec, scene, shadow, M, { network });
    } catch (e) {
      console.error('[exp runtime] build failed:', e);
      return { ok: false, errors: [e.message] };
    }

    // Re-parent onto aiLab room root for culling
    if (roomManager?.attachToRoom) {
      roomManager.attachToRoom('aiLab', built.meshes);
    }

    active.set(spec.id, built);
    console.log(`[exp runtime] spawned ${spec.id} (${spec.title}) — ${spec.components.length} components`);
    return { ok: true, id: spec.id };
  }

  function remove(id) {
    const h = active.get(id);
    if (!h) return false;
    _disposeHandle(h);
    active.delete(id);
    console.log(`[exp runtime] removed ${id}`);
    return true;
  }

  async function spawnFromPrompt(prompt, opts = {}) {
    const result = await generateSpec(prompt, opts);
    if (!result.ok) return result;
    const spec = result.spec;
    // Force room and origin server-side anyway, but enforce here too
    spec.room = 'aiLab';
    if (!Array.isArray(spec.origin)) spec.origin = [38, 0, -2];
    // Client-side fallback for startedAt in case server didn't stamp it
    // (dev without OPENAI_API_KEY, etc.). Real server always stamps.
    if (typeof spec.startedAt !== 'number') spec.startedAt = Date.now();

    // Local spawn
    const local = spawnLocal(spec);
    if (!local.ok) return { ok: false, errors: local.errors };

    // Broadcast to peers
    if (network?.broadcastExperiment) {
      network.broadcastExperiment(spec);
    }
    return { ok: true, id: spec.id, spec };
  }

  function attachToNetwork() {
    if (_attached) return;
    if (!network?.subscribeExperiments) return;
    _attached = true;
    network.subscribeExperiments({
      onAdd: (id, spec) => {
        if (active.has(id)) return; // already mine
        spawnLocal(spec);
      },
      onRemove: (id) => {
        if (active.has(id)) remove(id);
      },
    });
  }

  function list() {
    return [...active.keys()];
  }

  function dispose() {
    for (const [id, h] of active) {
      _disposeHandle(h);
      active.delete(id);
    }
    _attached = false;
  }

  // ── Dev helper: spawn a canned demo without an LLM call ─────────
  // Useful while iterating without an OpenAI key.
  function spawnDemo(name = 'pendulum') {
    const spec = makeDemoSpec(name);
    if (!spec) {
      console.warn(`[exp runtime] unknown demo "${name}"`);
      return { ok: false, error: 'unknown demo' };
    }
    spec.startedAt = Date.now();
    const r = spawnLocal(spec);
    if (r.ok && network?.broadcastExperiment) {
      network.broadcastExperiment(spec);
    }
    return r;
  }

  return { spawnLocal, spawnFromPrompt, remove, list, attachToNetwork, spawnDemo, dispose };
}

function rid() {
  return 'exp_demo_' + Math.random().toString(36).slice(2, 10);
}

function makeDemoSpec(name) {
  const ORIGIN = [38, 0, -2];
  if (name === 'pendulum') {
    return {
      id: rid(),
      title: 'Demo Pendulum',
      room: 'aiLab',
      origin: ORIGIN,
      components: [
        { type: 'stand',  id: 'stand1', pos: [0, 0, 0], params: { height: 2.2 } },
        { type: 'string', id: 'str1',   attach: 'stand1.top', params: { length: 1.2 } },
        { type: 'bob',    id: 'bob1',   attach: 'str1.end',
          params: { mass: 0.5, diameter: 0.18, color: '#cc4422' } },
        { type: 'label',  id: 'lbl1',   pos: [0, 2.6, 0], params: { text: 'Demo Pendulum' } },
        { type: 'readout', id: 'panel1', pos: [1.4, 1.6, 0], params: { title: 'Pendulum Data' } },
        { type: 'infoboard', id: 'info1', pos: [-1.6, 1.7, 0],
          params: { title: 'Theory', lines: ['T = 2π √(L/g)', 'L = 1.2 m, g = 9.81', 'Expect T ≈ 2.20 s'] } },
      ],
      physics: { kind: 'pendulum', drives: 'bob1',
        params: { g: 9.81, length: 'str1.length', initialAngle: 0.5 } },
      task: { goal: 'Verify the pendulum period.',
              successWhen: 'abs(bob1.measuredPeriod - 2 * pi * sqrt(str1.length / 9.81)) < 0.05',
              reward: 'Period matched theory!' },
    };
  }
  if (name === 'freefall') {
    return {
      id: rid(),
      title: 'Demo Free Fall',
      room: 'aiLab',
      origin: ORIGIN,
      components: [
        { type: 'stand',  id: 'tower', pos: [0, 0, 0], params: { height: 3.0, baseSize: 0.6 } },
        { type: 'bob',    id: 'ball',  pos: [0, 3.0, 0], params: { mass: 1.0, diameter: 0.22, color: '#dd9933' } },
        { type: 'label',  id: 'lbl1',  pos: [0, 3.5, 0], params: { text: 'Free Fall — h=3.0 m' } },
        { type: 'readout', id: 'panel1', pos: [1.6, 1.4, 0], params: { title: 'Fall Data' } },
        { type: 'infoboard', id: 'info1', pos: [-1.7, 1.6, 0],
          params: { title: 'Theory', lines: ['t = √(2h/g)', 'h = 3.0 m', 'Expect t ≈ 0.78 s'] } },
      ],
      physics: { kind: 'freefall', drives: 'ball', params: { g: 9.81, startY: 3.0, groundY: 0 } },
      task: { goal: 'Drop the ball.', successWhen: 'ball.hitAt > 0', reward: 'Landed!' },
    };
  }
  if (name === 'spring') {
    return {
      id: rid(),
      title: 'Demo Spring-Mass',
      room: 'aiLab',
      origin: ORIGIN,
      components: [
        { type: 'stand', id: 'rig', pos: [0, 0, 0], params: { height: 2.5 } },
        { type: 'spring', id: 'spr1', attach: 'rig.top', params: { restLength: 0.6, k: 25 } },
        { type: 'bob', id: 'mass1', attach: 'spr1.end', params: { mass: 0.4, color: '#33aaff' } },
        { type: 'label', id: 'lbl1', pos: [0, 2.9, 0], params: { text: 'Spring-Mass' } },
        { type: 'readout', id: 'panel1', pos: [1.4, 1.6, 0], params: { title: 'Spring Data' } },
      ],
      physics: { kind: 'spring-mass', drives: 'mass1',
        params: { k: 'spr1.k', restLength: 'spr1.restLength', mass: 'mass1.mass', startStretch: 0.18 } },
      task: { goal: 'Watch the oscillation.' },
    };
  }
  return null;
}
