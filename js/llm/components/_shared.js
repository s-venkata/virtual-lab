// js/llm/components/_shared.js
// Shared helpers used by multiple component factories.

export function pbr(scene, name, opts = {}) {
  const m = new BABYLON.PBRMaterial(name, scene);
  m.albedoColor   = opts.albedo   ? BABYLON.Color3.FromHexString(opts.albedo) : new BABYLON.Color3(0.6, 0.6, 0.65);
  m.emissiveColor = opts.emissive ? BABYLON.Color3.FromHexString(opts.emissive) : new BABYLON.Color3(0, 0, 0);
  if (opts.emissiveIntensity != null) m.emissiveIntensity = opts.emissiveIntensity;
  m.metallic  = opts.metallic  != null ? opts.metallic  : 0.4;
  m.roughness = opts.roughness != null ? opts.roughness : 0.5;
  if (opts.alpha != null) m.alpha = opts.alpha;
  if (opts.backFaceCulling === false) m.backFaceCulling = false;
  return m;
}

export function emissive(scene, name, hex, intensity = 1.0) {
  return pbr(scene, name, { albedo: hex, emissive: hex, emissiveIntensity: intensity, metallic: 0.1, roughness: 0.5 });
}

export function applyPos(node, props, origin) {
  if (props.pos && Array.isArray(props.pos)) {
    node.position.set(
      origin[0] + props.pos[0],
      origin[1] + props.pos[1],
      origin[2] + props.pos[2]
    );
  } else {
    node.position.set(origin[0], origin[1], origin[2]);
  }
  if (props.rot && Array.isArray(props.rot)) {
    node.rotation.set(props.rot[0], props.rot[1], props.rot[2]);
  }
}

export function castShadow(shadow, mesh) {
  if (shadow && mesh) shadow.addShadowCaster(mesh, true);
}

export function makeTextTexture(scene, name, draw, opts = {}) {
  const w = opts.w || 512, h = opts.h || 256;
  const tex = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
  tex.hasAlpha = !!opts.alpha;
  draw(tex.getContext(), w, h);
  tex.update();
  return tex;
}

export function dispText(scene, name, lines, opts = {}) {
  const fg = opts.fg || '#00e5ff';
  const bg = opts.bg || '#0a1628';
  const tex = makeTextTexture(scene, name, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = h / (lines.length + 1);
    lines.forEach((l, i) => {
      ctx.font = (opts.bold ? 'bold ' : '') + (opts.fontSize || 36) + 'px monospace';
      ctx.fillText(l, w / 2, lh * (i + 1));
    });
  }, { w: opts.w || 512, h: opts.h || 256 });
  return tex;
}
