// server/llm/promptSystem.js
// Hand-tuned system prompt + few-shot examples used for structured generation.
// Returns the messages array to send to OpenAI Chat Completions.

const SYSTEM = `You are a physics-experiment generator for a WebXR lab.
Your only job is to emit ONE valid JSON object matching the experiment-v1 schema.
Do not include explanations, prose, code fences, or markdown. JSON only.

ROOM: always "aiLab".
ORIGIN: the server ALWAYS overrides origin to [38, 0, -2] (centre of the aiLab
spawn pad, floor at y=0). Author every component.pos relative to that origin
regardless of what you emit.

COMPONENTS: use ONLY these 24 types —
  stand, rod, string, bob, spring,
  track, cart, ramp,
  lamp, slide, lens, mirror, screen,
  polarizer, prism, laser, photodetector, fiber,
  label, readout, slider, button, infoboard,
  stand (24 total; do not invent new types).

Coordinates inside a component's "pos" are RELATIVE to the experiment "origin".
Use "attach" to anchor one component to another (e.g. "stand1.top", "string1.end").
Each id must be unique, snake_case allowed, max 30 chars.

INTERACTIVITY:
  - "draggable": true makes the component grabbable in VR / mouse-drag on desktop.
  - "constrain": one of "none" | "axis-x" | "axis-y" | "axis-z"
                 | "plane-xy" | "plane-xz" | "plane-yz" | "pendulum".
    Combine with draggable=true (e.g. a lens on an optical bench uses axis-x).

PHYSICS kinds: pendulum, freefall, spring-mass, thin-lens, snell, polarization, none.
"physics.params" values may be numbers OR string references like "string1.length".
"physics.drives" MUST be the id of a real component in the spec.

TASK.successWhen is an optional safe expression. Allowed:
  - identifiers in dot-form referencing component params/state, e.g. "bob1.angle"
  - + - * / % ** > < >= <= == != && || !
  - functions: sin, cos, tan, asin, acos, atan, atan2, sqrt, abs, min, max, log, exp, pow, floor, ceil, round, sign
  - constants: pi, e
No brackets, no member access via [].

OUTPUT: a single JSON object — nothing else.`;

const EXAMPLE_PENDULUM = {
  id: 'exp_pendulum_demo',
  title: 'Simple Pendulum',
  room: 'aiLab',
  origin: [38, 0, -2],
  components: [
    { type: 'stand',  id: 'stand1', pos: [0, 0, 0], params: { height: 2.2 } },
    { type: 'string', id: 'str1',   attach: 'stand1.top', params: { length: 1.2 } },
    { type: 'bob',    id: 'bob1',   attach: 'str1.end',
      params: { mass: 0.5, diameter: 0.18, color: '#cc4422' } },
    { type: 'label',  id: 'lbl1',   pos: [0, 2.6, 0], params: { text: 'Simple Pendulum', color: '#00e5ff' } },
    { type: 'readout', id: 'panel1', pos: [1.4, 1.6, 0], params: { title: 'Pendulum Data', width: 1.6, height: 0.9 } },
    { type: 'infoboard', id: 'info1', pos: [-1.6, 1.7, 0],
      params: { title: 'Theory', lines: ['T = 2π √(L/g)', 'L = 1.2 m, g = 9.81', 'Expect T ≈ 2.20 s'] } },
  ],
  physics: { kind: 'pendulum', drives: 'bob1', params: { g: 9.81, length: 'str1.length', initialAngle: 0.5 } },
  task: { goal: 'Watch the pendulum swing and verify the period.',
          successWhen: 'abs(bob1.measuredPeriod - 2 * pi * sqrt(str1.length / 9.81)) < 0.05',
          reward: 'Period matched theory within 50 ms' },
};

const EXAMPLE_FREEFALL = {
  id: 'exp_freefall_demo',
  title: 'Galileo Free Fall',
  room: 'aiLab',
  origin: [38, 0, -2],
  components: [
    { type: 'stand',  id: 'tower', pos: [0, 0, 0], params: { height: 3.0, baseSize: 0.6 } },
    { type: 'bob',    id: 'ball',  pos: [0, 3.0, 0], params: { mass: 1.0, diameter: 0.22, color: '#dd9933' } },
    { type: 'label',  id: 'lbl1',  pos: [0, 3.5, 0], params: { text: 'Free Fall — h = 3.0 m', color: '#ffaa44' } },
    { type: 'readout', id: 'panel1', pos: [1.6, 1.4, 0], params: { title: 'Fall Data', width: 1.6, height: 0.9 } },
    { type: 'infoboard', id: 'info1', pos: [-1.7, 1.6, 0],
      params: { title: 'Theory', lines: ['t = √(2h/g)', 'h = 3.0 m, g = 9.81', 'Expect t ≈ 0.78 s'] } },
  ],
  physics: { kind: 'freefall', drives: 'ball', params: { g: 9.81, startY: 3.0, groundY: 0 } },
  task: { goal: 'Drop the ball and observe the fall.',
          successWhen: 'ball.hitAt > 0',
          reward: 'Ball landed' },
};

const EXAMPLE_LENS = {
  id: 'exp_lens_demo',
  title: 'Thin Lens Image Projection',
  room: 'aiLab',
  origin: [38, 1.0, -2],
  components: [
    { type: 'track', id: 'bench', pos: [0, 0, 0], params: { length: 3.5, width: 0.5 } },
    { type: 'lamp',  id: 'lamp1', pos: [-1.5, 0.4, 0], params: { color: '#fff5d8', intensity: 4 } },
    { type: 'slide', id: 'slide1', pos: [-1.2, 0.4, 0], params: { text: 'F', color: '#fff5d8' } },
    { type: 'lens',  id: 'lens1', pos: [0.0, 0.4, 0], draggable: true, constrain: 'axis-x',
      params: { focal: 0.5, diameter: 0.4, kind: 'convex' } },
    { type: 'screen', id: 'screen1', pos: [1.5, 0.4, 0], params: { width: 0.7, height: 0.7 } },
    { type: 'label', id: 'lbl1', pos: [0, 1.2, 0], params: { text: 'Move the lens', color: '#00e5ff' } },
    { type: 'readout', id: 'panel1', pos: [1.7, 1.5, 0], params: { title: 'Lens Data' } },
  ],
  physics: { kind: 'thin-lens', drives: 'lens1', params: { f: 0.5 } },
  task: { goal: 'Slide the lens to project a sharp inverted F.',
          successWhen: 'lens1.sharpness > 0.95',
          reward: 'Sharp focus achieved!' },
};

// New example showcasing draggable + constrain on a spring rig (Y-axis)
const EXAMPLE_SPRING = {
  id: 'exp_spring_demo',
  title: 'Spring-Mass Oscillator',
  room: 'aiLab',
  origin: [38, 0, -2],
  components: [
    { type: 'stand', id: 'rig', pos: [0, 0, 0], params: { height: 2.5 } },
    { type: 'spring', id: 'spr1', attach: 'rig.top', params: { restLength: 0.6, k: 25 } },
    { type: 'bob', id: 'mass1', attach: 'spr1.end',
      params: { mass: 0.4, diameter: 0.2, color: '#33aaff' } },
    { type: 'label', id: 'lbl1', pos: [0, 2.9, 0], params: { text: 'Spring-Mass', color: '#33aaff' } },
    { type: 'readout', id: 'panel1', pos: [1.4, 1.6, 0], params: { title: 'Spring Data' } },
  ],
  physics: { kind: 'spring-mass', drives: 'mass1',
    params: { k: 'spr1.k', restLength: 'spr1.restLength', mass: 'mass1.mass', startStretch: 0.18 } },
  task: { goal: 'Watch the oscillation.' },
};

function buildMessages(userPrompt) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user',   content: 'Build me a simple pendulum experiment.' },
    { role: 'assistant', content: JSON.stringify(EXAMPLE_PENDULUM) },
    { role: 'user',   content: 'Galileo free fall, drop a ball from 3 metres.' },
    { role: 'assistant', content: JSON.stringify(EXAMPLE_FREEFALL) },
    { role: 'user',   content: 'Thin convex lens projecting an F onto a screen; the lens should be draggable along the bench.' },
    { role: 'assistant', content: JSON.stringify(EXAMPLE_LENS) },
    { role: 'user',   content: 'Spring-mass oscillator with k=25, m=0.4, starting stretch 0.18 m.' },
    { role: 'assistant', content: JSON.stringify(EXAMPLE_SPRING) },
    { role: 'user',   content: userPrompt },
  ];
}

module.exports = { SYSTEM, buildMessages };
