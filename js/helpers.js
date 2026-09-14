// js/helpers.js
// Shared mesh creation helpers used across room, benches, equipment

export function box(scene, name, w, h, d, pos, mat, castS = true, recvS = true, shadow = null) {
  const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  b.position.set(...pos);
  b.material       = mat;
  b.checkCollisions = true;
  b.receiveShadows  = recvS;
  if (castS && shadow) shadow.addShadowCaster(b, true);
  return b;
}

export function cyl(scene, name, r, h, pos, mat, tess = 24, castS = true, shadow = null) {
  const c = BABYLON.MeshBuilder.CreateCylinder(
    name, { diameter: r * 2, height: h, tessellation: tess }, scene
  );
  c.position.set(...pos);
  c.material       = mat;
  c.receiveShadows = true;
  if (castS && shadow) shadow.addShadowCaster(c, true);
  return c;
}

export function sphere(scene, name, d, pos, mat, castS = true, shadow = null) {
  const s = BABYLON.MeshBuilder.CreateSphere(name, { diameter: d, segments: 16 }, scene);
  s.position.set(...pos);
  s.material       = mat;
  s.receiveShadows = true;
  if (castS && shadow) shadow.addShadowCaster(s, true);
  return s;
}

export function addDoorNamePlate(scene, text, position, rotationY = 0) {
  const plate = BABYLON.MeshBuilder.CreateBox("door_name_plate", {
    width: 1.0,
    height: 0.35,
    depth: 0.03
  }, scene);

  plate.position = position;
  plate.rotation.y = rotationY;

  const tex = new BABYLON.DynamicTexture("door_text_tex", {
    width: 512,
    height: 256
  }, scene);

  tex.drawText(
    text,
    null,
    145,
    "bold 48px Arial",
    "white",
    "#222222",
    true
  );

  const mat = new BABYLON.StandardMaterial("door_plate_mat", scene);
  mat.diffuseTexture = tex;
  mat.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.2);

  plate.material = mat;
  return plate;
}