// js/models.js
// Loads external 3D models into the scene.
// Supports:
//   • GLB / GLTF        (mesh-based — most common, from Blender, Hunyuan, Sketchfab, etc.)
//   • Gaussian Splats   (.splat / .ply — photoreal scene captures from Luma, Polycam, KIRI)
//   • OBJ, STL          (legacy formats — also supported via SceneLoader)
//
// Place files in:   vr-lab/public/models/<your-file>.glb
// Reference as:     /models/<your-file>.glb

// ── Apply position / rotation / scale to any TransformNode-like object ──────
function applyTransform(node, opts) {
  if (opts.position) {
    node.position = new BABYLON.Vector3(...opts.position);
  }
  if (opts.rotation) {
    node.rotation = new BABYLON.Vector3(...opts.rotation);
  }
  if (opts.scale !== undefined) {
    const s = typeof opts.scale === 'number'
      ? [opts.scale, opts.scale, opts.scale]
      : opts.scale;
    node.scaling = new BABYLON.Vector3(...s);
  }
}

// ── Load a GLB/GLTF/OBJ/STL model ────────────────────────────────────────────
// opts: { position, rotation, scale, shadow, checkCollisions, receiveShadows }
export async function loadModel(scene, url, opts = {}) {
  console.log('Loading model:', url);

  let result;
  try {
    result = await BABYLON.SceneLoader.ImportMeshAsync('', '', url, scene);
  } catch (e) {
    console.error('Failed to load', url, e);
    return null;
  }

  // The first mesh is usually the __root__ container — transform it
  const root = result.meshes[0];
  applyTransform(root, opts);

  // Apply shadows + collisions on every child mesh
  result.meshes.forEach(m => {
    if (m.material) {
      if (opts.receiveShadows !== false) m.receiveShadows = true;
      if (opts.shadow) opts.shadow.addShadowCaster(m, true);
    }
    if (opts.checkCollisions) m.checkCollisions = true;
  });

  result.root = root; 
  return result;
}

// ── Load a Gaussian Splat (.splat or .ply) ───────────────────────────────────
// opts: { position, rotation, scale }
export async function loadSplat(scene, url, opts = {}) {
  if (!BABYLON.GaussianSplattingMesh) {
    console.error('Gaussian Splat support not available — upgrade Babylon.js to 7+');
    return null;
  }

  console.log('Loading splat:', url);
  const splat = new BABYLON.GaussianSplattingMesh(
    'splat_' + Date.now(), null, scene
  );

  try {
    await splat.loadFileAsync(url);
  } catch (e) {
    console.error('Failed to load splat', url, e);
    return null;
  }

  applyTransform(splat, opts);
  return splat;
}

// ── Auto-load a list of models defined elsewhere ─────────────────────────────
// modelList: [{ type: 'glb' | 'splat', url, ...transformOpts }]
export async function loadAllModels(scene, modelList, defaultOpts = {}) {
  for (const cfg of modelList) {
    const opts = { ...defaultOpts, ...cfg };
    if (cfg.type === 'splat') {
      await loadSplat(scene, cfg.url, opts);
    } else {
      await loadModel(scene, cfg.url, opts);
    }
  }
}
