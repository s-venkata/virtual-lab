// js/lighting.js
// All scene lights and shadow generator.
// Returns references so light-switch can toggle everything.

export function createLighting(scene) {
  // Hemispheric ambient
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity   = 0.22;
  hemi.diffuse     = new BABYLON.Color3(0.7, 0.8, 1.0);
  hemi.groundColor = new BABYLON.Color3(0.06, 0.08, 0.12);

  // Main directional (shadow caster)
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.3, -1, -0.3), scene);
  sun.position  = new BABYLON.Vector3(2, 6, 4);
  sun.intensity = 1.0;
  sun.diffuse   = new BABYLON.Color3(0.88, 0.94, 1.0);
  sun.specular  = new BABYLON.Color3(0.5, 0.7, 1.0);

  const shadow = new BABYLON.ShadowGenerator(2048, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 24;
  shadow.bias       = 0.0004;
  shadow.normalBias = 0.06;

  // Fill point lights
  const addPoint = (pos, hex, intensity, range) => {
    const l = new BABYLON.PointLight('pl_' + pos.join(''), new BABYLON.Vector3(...pos), scene);
    l.diffuse   = BABYLON.Color3.FromHexString(hex);
    l.specular  = BABYLON.Color3.FromHexString(hex);
    l.intensity = intensity;
    l.range     = range;
    return l;
  };

const points = [];

  return { sun, shadow, hemi, points };
}
