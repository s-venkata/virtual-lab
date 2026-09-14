// js/llm/components/_registry.js
// Auto-registers every primitive factory so the builder can dispatch by `type`.
//
// Each factory has the signature:
//   (scene, props, ctx) → {
//     root: TransformNode | Mesh,   // single anchor for child meshes
//     meshes: Mesh[],               // all created meshes (for shadow & cleanup)
//     anchors?: { [name]: Vector3 }, // named local anchors (e.g. { top, bottom, end })
//     state?: object,               // mutable per-frame state for physics
//     params: object,               // resolved final params (length, mass, etc.)
//   }
//
// `props` is the validated DSL component object.
// `ctx` carries: { scene, shadow, origin, components: Map<id, factoryResult>,
//                  M (materials), pickup, network }.

import { stand }  from './stand.js';
import { rod }    from './rod.js';
import { stringComp } from './string.js';
import { bob }    from './bob.js';
import { spring } from './spring.js';
import { track }  from './track.js';
import { cart }   from './cart.js';
import { ramp }   from './ramp.js';
import { lamp }   from './lamp.js';
import { slide }  from './slide.js';
import { lens }   from './lens.js';
import { mirror } from './mirror.js';
import { screenComp } from './screen.js';
import { polarizer } from './polarizer.js';
import { prism }    from './prism.js';
import { laser }    from './laser.js';
import { photodetector } from './photodetector.js';
import { fiber }    from './fiber.js';
import { label }    from './label.js';
import { readout }  from './readout.js';
import { slider }   from './slider.js';
import { button }   from './button.js';
import { infoboard } from './infoboard.js';

const REGISTRY = {
  stand, rod, string: stringComp, bob, spring,
  track, cart, ramp,
  lamp, slide, lens, mirror, screen: screenComp,
  polarizer, prism, laser, photodetector, fiber,
  label, readout, slider, button, infoboard,
};

export function getFactory(type) {
  return REGISTRY[type] || null;
}

export function listTypes() {
  return Object.keys(REGISTRY);
}
