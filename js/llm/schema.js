// js/llm/schema.js
// Mirror of server/llm/schema.json — embedded so the client can validate
// experiment specs without an HTTP round-trip.
//
// Source of truth: server/llm/schema.json. Keep in sync if you change one.

export const EXPERIMENT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'experiment-v1',
  title: 'AI Lab Experiment Spec',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'room', 'origin', 'components'],
  properties: {
    id: {
      type: 'string',
      pattern: '^exp_[a-zA-Z0-9_-]{3,40}$',
    },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    room: { type: 'string', enum: ['aiLab'] },
    origin: {
      type: 'array',
      items: { type: 'number' },
      minItems: 3, maxItems: 3,
    },
    startedAt: { type: 'number' },   // server-stamped epoch ms; used for deterministic physics t₀
    components: {
      type: 'array',
      minItems: 1, maxItems: 30,
      items: { $ref: '#/definitions/component' },
    },
    physics: { $ref: '#/definitions/physics' },
    task:    { $ref: '#/definitions/task' },
  },
  definitions: {
    vec3: {
      type: 'array',
      items: { type: 'number' },
      minItems: 3, maxItems: 3,
    },
    component: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id'],
      properties: {
        type: {
          type: 'string',
          enum: [
            'stand', 'rod', 'string', 'bob', 'spring',
            'track', 'cart', 'ramp',
            'lamp', 'slide', 'lens', 'mirror', 'screen',
            'polarizer', 'prism', 'laser', 'photodetector', 'fiber',
            'label', 'readout', 'slider', 'button', 'infoboard',
          ],
        },
        id: {
          type: 'string',
          pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,30}$',
        },
        pos: { $ref: '#/definitions/vec3' },
        rot: { $ref: '#/definitions/vec3' },
        attach: { type: 'string' },
        draggable: { type: 'boolean', default: false },
        constrain: {
          type: 'string',
          enum: ['none', 'axis-x', 'axis-y', 'axis-z',
                 'plane-xy', 'plane-xz', 'plane-yz', 'pendulum'],
          default: 'none',
        },
        params: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    physics: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'drives'],
      properties: {
        kind: {
          type: 'string',
          enum: ['pendulum', 'freefall', 'spring-mass',
                 'thin-lens', 'snell', 'polarization', 'none'],
        },
        params: { type: 'object', additionalProperties: true },
        drives: { type: 'string' },
      },
    },
    task: {
      type: 'object',
      additionalProperties: false,
      required: ['goal'],
      properties: {
        goal:        { type: 'string', minLength: 1, maxLength: 200 },
        successWhen: { type: 'string', maxLength: 200 },
        reward:      { type: 'string', maxLength: 200 },
      },
    },
  },
};

// ── Lightweight hand-rolled validator ─────────────────────────────
// We intentionally avoid pulling Ajv on the client (saves ~30 KB).
// Returns { ok: boolean, errors: string[] }.

const COMPONENT_TYPES = new Set(EXPERIMENT_SCHEMA.definitions.component.properties.type.enum);
const PHYSICS_KINDS   = new Set(EXPERIMENT_SCHEMA.definitions.physics.properties.kind.enum);
const CONSTRAINTS     = new Set(EXPERIMENT_SCHEMA.definitions.component.properties.constrain.enum);
const ID_RE   = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/;
const EXP_ID_RE = /^exp_[a-zA-Z0-9_-]{3,40}$/;

export function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') {
    return { ok: false, errors: ['spec must be an object'] };
  }
  if (typeof spec.id !== 'string' || !EXP_ID_RE.test(spec.id)) {
    errors.push('id must match /^exp_[a-zA-Z0-9_-]{3,40}$/');
  }
  if (typeof spec.title !== 'string' || !spec.title.length || spec.title.length > 80) {
    errors.push('title must be 1..80 chars');
  }
  if (spec.room !== 'aiLab') {
    errors.push('room must be "aiLab"');
  }
  if (!Array.isArray(spec.origin) || spec.origin.length !== 3 ||
      !spec.origin.every(n => typeof n === 'number' && Number.isFinite(n))) {
    errors.push('origin must be [x,y,z] numbers');
  }
  if (!Array.isArray(spec.components) || spec.components.length < 1 ||
      spec.components.length > 30) {
    errors.push('components must be 1..30 items');
  } else {
    const ids = new Set();
    spec.components.forEach((c, i) => {
      const path = `components[${i}]`;
      if (!c || typeof c !== 'object') {
        errors.push(`${path} must be object`);
        return;
      }
      if (!COMPONENT_TYPES.has(c.type)) {
        errors.push(`${path}.type "${c.type}" invalid`);
      }
      if (typeof c.id !== 'string' || !ID_RE.test(c.id)) {
        errors.push(`${path}.id "${c.id}" invalid`);
      } else if (ids.has(c.id)) {
        errors.push(`${path}.id "${c.id}" duplicate`);
      } else {
        ids.add(c.id);
      }
      if (c.pos && (!Array.isArray(c.pos) || c.pos.length !== 3)) {
        errors.push(`${path}.pos must be [x,y,z]`);
      }
      if (c.rot && (!Array.isArray(c.rot) || c.rot.length !== 3)) {
        errors.push(`${path}.rot must be [x,y,z]`);
      }
      if (c.constrain && !CONSTRAINTS.has(c.constrain)) {
        errors.push(`${path}.constrain "${c.constrain}" invalid`);
      }
    });
  }
  if (spec.physics) {
    if (!PHYSICS_KINDS.has(spec.physics.kind)) {
      errors.push(`physics.kind "${spec.physics.kind}" invalid`);
    }
    if (typeof spec.physics.drives !== 'string') {
      errors.push('physics.drives must be string component id');
    }
  }
  if (spec.task) {
    if (typeof spec.task.goal !== 'string' || !spec.task.goal.length) {
      errors.push('task.goal must be non-empty string');
    }
    if (spec.task.successWhen && typeof spec.task.successWhen !== 'string') {
      errors.push('task.successWhen must be string');
    }
  }
  return { ok: errors.length === 0, errors };
}
