// js/materials.js
// PBR materials — real textures for floor, walls, wood/bench

const _cache = {};

function pbr(scene, name, hex, rough, metal, opts = {}) {
  if (_cache[name]) return _cache[name];
  const m = new BABYLON.PBRMaterial(name, scene);
  m.albedoColor = BABYLON.Color3.FromHexString(hex);
  m.roughness   = rough;
  m.metallic    = metal;
  if (opts.alpha !== undefined) {
    m.alpha = opts.alpha;
    m.transparencyMode = 2;
  }
  if (opts.backFaceCulling === false) m.backFaceCulling = false;
  if (opts.emi)  m.emissiveColor     = BABYLON.Color3.FromHexString(opts.emi);
  if (opts.emiI) m.emissiveIntensity = opts.emiI;
  _cache[name] = m;
  return m;
}

function addBump(scene, mat, scale = 0.4, freq = 4) {
  const noise = new BABYLON.NoiseProceduralTexture(mat.name + '_noise', 512, scene);
  noise.octaves     = freq;
  noise.persistence = 0.65;
  noise.animationSpeedFactor = 0;
  mat.bumpTexture       = noise;
  mat.bumpTexture.level = scale;
}

// ── Textured PBR material ────────────────────────────────────────────────────
// opts: { tile, tileU, tileV, bumpStrength }
function pbrTextured(scene, name, basePath, opts = {}) {
  const m = new BABYLON.PBRMaterial(name, scene);

  m.albedoTexture   = new BABYLON.Texture(`${basePath}/color.jpg`, scene);
  m.bumpTexture     = new BABYLON.Texture(`${basePath}/normal.jpg`, scene);
  m.metallicTexture = new BABYLON.Texture(`${basePath}/roughness.jpg`, scene);
  // AO is optional — some textures don't have it
  const aoUrl = `${basePath}/ao.jpg`;
  fetch(aoUrl, { method: 'HEAD' })
    .then(r => { if (r.ok) m.ambientTexture = new BABYLON.Texture(aoUrl, scene); })
    .catch(() => {});

  m.useRoughnessFromMetallicTextureGreen = true;
  m.useRoughnessFromMetallicTextureAlpha = false;
  m.useMetallnessFromMetallicTextureBlue = false;
  m.useAmbientInGrayScale = true;
  m.metallic  = 0;
  m.roughness = 1;

  // Tiling — supports separate U / V scaling for non-square surfaces (walls)
  const uScale = opts.tileU || opts.tile || 1;
  const vScale = opts.tileV || opts.tile || 1;
  [m.albedoTexture, m.bumpTexture, m.metallicTexture,].forEach(t => {
    if (t) { t.uScale = uScale; t.vScale = vScale; }
  });

  if (opts.bumpStrength !== undefined && m.bumpTexture) {
    m.bumpTexture.level = opts.bumpStrength;
  }

  return m;
}

// ── Public API ───────────────────────────────────────────────────────────────
export function createMaterials(scene) {
  const p  = (name, hex, rough, metal, opts) => pbr(scene, name, hex, rough, metal, opts);
  const bf = { backFaceCulling: false };


  const M = {
    // ── Textured surfaces ────────────────────────────────
    floor: pbrTextured(scene, 'floor', '/textures/concrete', { tile: 4, bumpStrength: 0.6 }),
    wood:  pbrTextured(scene, 'wood',  '/textures/wood',     { tile: 1, bumpStrength: 0.5 }),
    bench: pbrTextured(scene, 'bench', '/textures/wood',     { tile: 2, bumpStrength: 0.4 }),
    wall:  p('wall',  '#ffffff', 1.0, 0.00),
    tile:  p('tile',  '#ffffff', 1.0, 0.00),

    // ── Ceiling stays matte white ─────────────────────────
    ceiling: p('ceiling', '#ffffff', 1.0, 0.00),

    // ── Furniture ────────────────────────────────────────
    cabinet: p('cabinet', '#3b3e4d', 0.70, 0.05),
    door:    p('door',    '#484c5a', 0.65, 0.10),
    rubber:  p('rubber',  '#1a1c22', 0.95, 0.00),
    shelf:   p('shelf',   '#555968', 0.50, 0.40),

    // ── Metals ───────────────────────────────────────────
    metal:   p('metal',   '#9aabb0', 0.25, 0.92),
    dkMetal: p('dkMetal', '#2e3038', 0.40, 0.85),
    chrome:  p('chrome',  '#d4dde0', 0.08, 0.98),
    sink:    p('sink',    '#8899aa', 0.20, 0.50),

    // ── Glass / transparent ──────────────────────────────
    glass:   p('glass',   '#aaccdd', 0.02, 0.00, { alpha: 0.22, ...bf }),
    glass2:  p('glass2',  '#88ffcc', 0.02, 0.00, { alpha: 0.22, ...bf }),
    glass3:  p('glass3',  '#ffddaa', 0.02, 0.00, { alpha: 0.24, ...bf }),
    flask:   p('flask',   '#ddbb55', 0.02, 0.00, { alpha: 0.32, ...bf }),
    doorWin: p('doorWin', '#aaccee', 0.05, 0.00, { alpha: 0.30, ...bf }),

    // ── Liquids ──────────────────────────────────────────
    liqBlue: p('liqBlue', '#2255cc', 0.10, 0.00, { alpha: 0.70 }),
    liqGrn:  p('liqGrn',  '#11aa66', 0.10, 0.00, { alpha: 0.70 }),
    liqYel:  p('liqYel',  '#ddaa22', 0.10, 0.00, { alpha: 0.65 }),

    // ── Emissive ─────────────────────────────────────────
    glowPanel: p('glowPanel', '#cce8ff', 0.9, 0.00, { emi: '#cce8ff' }),
    screen:    p('screen',    '#002244', 0.80, 0.00, { emi: '#0077cc', emiI: 2.0 }),
    ledGrn:    p('ledGrn',    '#00ff44', 0.90, 0.00, { emi: '#00ff44', emiI: 4.0 }),
    ledOrange: p('ledOrange', '#ff6600', 0.90, 0.00, { emi: '#ff4400', emiI: 3.0 }),
    centDisp:  p('centDisp',  '#001122', 0.80, 0.00, { emi: '#00aaff', emiI: 1.5 }),

    // ── Misc ─────────────────────────────────────────────
    white:   p('white',   '#f2f0eb', 0.75, 0.00),
    red:     p('red',     '#cc1100', 0.55, 0.20),
    yellow:  p('yellow',  '#ffcc00', 0.50, 0.05),
    cent:    p('cent',    '#dde0e3', 0.30, 0.40),
    chalk:   p('chalk',   '#223344', 0.90, 0.00),
  };

  // Cabinet still uses procedural bump (no real texture for it)
  addBump(scene, M.cabinet, 0.18, 4);

  return M;
}
