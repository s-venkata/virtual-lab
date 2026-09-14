// js/llm/components/polarizer.js — wire-grid polarizer with rotation handle
// Beam is expected to travel along +X (matches the polarization few-shot).
// The wire grid must rotate around the beam axis (X) so `angle=0` is vertical
// wires and `angle=90` is horizontal, matching real polarizer conventions.
import { pbr, applyPos } from './_shared.js';

export function polarizer(scene, props, ctx) {
  const p = props.params || {};
  const angleDeg = typeof p.angle === 'number' ? p.angle : 0;
  const diameter = typeof p.diameter === 'number' ? p.diameter : 0.4;

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const ringMat = pbr(scene, `${props.id}_ring_mat`, {
    albedo: '#222', metallic: 0.9, roughness: 0.3,
  });
  const ring = BABYLON.MeshBuilder.CreateTorus(`${props.id}_ring`, {
    diameter, thickness: 0.025, tessellation: 36,
  }, scene);
  ring.parent     = root;
  ring.rotation.z = Math.PI / 2;  // torus tube plane is YZ (beam along X)
  ring.material   = ringMat;

  // Wire grid — rotates around the beam axis (world X, local root X).
  const gridRoot = new BABYLON.TransformNode(`${props.id}_grid_root`, scene);
  gridRoot.parent = root;
  gridRoot.rotation.x = (angleDeg * Math.PI) / 180;   // beam-axis roll

  const wireMat = pbr(scene, `${props.id}_wire_mat`, {
    albedo: '#cccccc', metallic: 0.95, roughness: 0.15,
  });
  const wires = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = (i - (N - 1) / 2) / N;
    // Vertical wires (height along Y), spaced along Z. Rotating gridRoot on X
    // spins them around the beam axis.
    const wire = BABYLON.MeshBuilder.CreateBox(`${props.id}_wire_${i}`, {
      width: 0.005, height: diameter * 0.92, depth: 0.005,
    }, scene);
    wire.position.set(0, 0, t * diameter * 0.85);
    wire.material = wireMat;
    wire.parent   = gridRoot;
    wires.push(wire);
  }

  function setAngle(deg) {
    gridRoot.rotation.x = (deg * Math.PI) / 180;
  }

  return {
    root,
    meshes: [ring, ...wires],
    anchors: { center: new BABYLON.Vector3(0, 0, 0) },
    state:  { angle: angleDeg, gridRoot, setAngle },
    params: { angle: angleDeg, diameter },
  };
}
