// js/llm/components/button.js — clickable cylinder with emissive cap
import { pbr, applyPos, castShadow } from './_shared.js';

export function button(scene, props, ctx) {
  const p = props.params || {};
  const color = p.color || '#cc0000';
  const labelText = p.label || 'START';

  const root = new BABYLON.TransformNode(`comp_${props.id}`, scene);
  applyPos(root, props, ctx.origin);

  const ringMat = pbr(scene, `${props.id}_ring_mat`, { albedo: '#888', metallic: 0.9, roughness: 0.2 });
  const capMat  = pbr(scene, `${props.id}_cap_mat`,  {
    albedo: color, emissive: color, emissiveIntensity: 0.4, metallic: 0.2, roughness: 0.4,
  });

  const ring = BABYLON.MeshBuilder.CreateTorus(`${props.id}_ring`, {
    diameter: 0.16, thickness: 0.012, tessellation: 32,
  }, scene);
  ring.parent   = root;
  ring.material = ringMat;
  castShadow(ctx.shadow, ring);

  const cap = BABYLON.MeshBuilder.CreateCylinder(`${props.id}_cap`, {
    diameter: 0.13, height: 0.04, tessellation: 32,
  }, scene);
  cap.position.y = 0.025;
  cap.parent     = root;
  cap.material   = capMat;
  castShadow(ctx.shadow, cap);

  cap.actionManager = new BABYLON.ActionManager(scene);
  cap.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
    BABYLON.ActionManager.OnPointerOverTrigger,
    () => { cap.scaling = new BABYLON.Vector3(1.08, 1.08, 1.08); capMat.emissiveIntensity = 0.9; }
  ));
  cap.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
    BABYLON.ActionManager.OnPointerOutTrigger,
    () => { cap.scaling = new BABYLON.Vector3(1, 1, 1); capMat.emissiveIntensity = 0.4; }
  ));

  return {
    root,
    meshes: [ring, cap],
    state:  { capMat, cap, label: labelText, onPress: null },
    params: { color, label: labelText },
  };
}
