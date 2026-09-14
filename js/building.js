// js/building.js
// Top-level building layout: defines positions of all rooms + corridor.
// All other modules reference these constants.
//
// Floor plan (top-down view, +Z forward, +X right):
//
//   Z+ (north / back wall of building)
//
//   ┌──────────────┐  ┌──────────────┐
//   │              │  │              │
//   │     LAB      │  │  DATACENTER  │
//   │              │  │              │
//   │     ┌────┐   │  │   ┌────┐     │
//   └─────┤door├───┘  └───┤door├─────┘
//         └────┘          └────┘
//   ────────────────────────────────────
//                 CORRIDOR
//   ────────────────────────────────────
//                  ┌────┐
//                  │door│
//                  └────┘
//             ┌──────────────┐
//             │              │
//             │  CLASSROOM   │
//             │              │
//             └──────────────┘
//
//   Z- (south / front of building)

export const BUILDING = {
  // ── LAB (existing room — keep coords compatible) ─────────────────
  lab: {
    name: 'lab',
    center: [0, 0, 0],
    size:   [16, 4, 16],
    floorY: 0,
    ceilingY: 4,
    doorPosition: [-3, 0, 8],
    doorRotation: 0,
    doorWidth: 1.0,
    doorHeight: 2.1,
  },

  // ── DATACENTER ───────────────────────────────────────────────────
  datacenter: {
    name: 'datacenter',
    center: [22, 0, 0],
    size:   [12, 4, 16],
    floorY: 0,
    ceilingY: 4,
    doorPosition: [22, 0, 8],
    doorRotation: 0,
    doorWidth: 1.0,
    doorHeight: 2.1,
  },

  // ── AI LAB (new) ─────────────────────────────────────────────────
  // Empty studio room dedicated to LLM-generated experiments.
  // Generated via the wrist menu → "AI Lab Generator".
  aiLab: {
    name: 'aiLab',
    center: [38, 0, 0],
    size:   [12, 4, 16],
    floorY: 0,
    ceilingY: 4,
    doorPosition: [38, 0, 8],
    doorRotation: 0,
    doorWidth: 1.0,
    doorHeight: 2.1,
  },

  // ── CORRIDOR (connects all 4 rooms) ──────────────────────────────
  // Extended eastward to span lab (x≈0) → datacenter (x=22) → aiLab (x=38).
  corridor: {
    name: 'corridor',
    center: [16, 0, 10],
    size:   [54, 3.2, 4],
    floorY: 0,
    ceilingY: 3.2,
  },

  // ── CLASSROOM (south of corridor — replaces outdoor) ─────────────
  outdoor: {
    name: 'outdoor',
    center: [9.5, 0, 22],
    size:   [20, 4, 20],
    floorY: 0,
    ceilingY: 4,
    doorPosition: [9.5, 0, 12],
    doorRotation: Math.PI,
    doorWidth: 1.0,
    doorHeight: 2.1,
  },
};

// Helper: spawn point — where you start when entering VR
export const SPAWN = {
  position: [-3, 1.65, 5],
  target:   [-3, 1.65, 8],
};