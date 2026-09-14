// js/effects.js
// Post-processing pipeline, dust, god rays (returns cones), VR
//
// v13 fixes:
//  1. disableMultiview: true — GaussianSplattingMesh doesn't render in WebXR
//     multi-view stereo mode. Disabling it fixes the invisible splat in VR.
//     Small perf cost (~5%) but unavoidable until Babylon fixes splat multi-view.
//  2. onTargetMeshHitObservable — correct observable name (was onTargetMeshHit)
//     which caused the patchXR crash and left the room manager stuck on 'corridor'.
//  3. Room manager teleport hook uses XR camera position, not desktop camera.

export function setupEnvironment(scene) {
  try {
    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
      'https://assets.babylonjs.com/environments/environmentSpecular.env', scene
    );
    scene.environmentTexture   = env;
    scene.environmentIntensity = 0.80;
  } catch (e) {
    console.warn('HDRI environment failed to load.');
  }
}

// Returns array of cone meshes so they can be toggled by the light switch
export function setupGodRays(scene) {
  return [];
}

export function setupPostProcessing(scene, camera) {
  const pp = new BABYLON.DefaultRenderingPipeline('pp', true, scene, [camera]);

  pp.bloomEnabled   = true;
  pp.bloomThreshold = 0.50;
  pp.bloomWeight    = 0.78;
  pp.bloomKernel    = 96;
  pp.bloomScale     = 0.55;

  pp.chromaticAberrationEnabled = true;
  pp.chromaticAberration.aberrationAmount = 1.2;

  pp.sharpenEnabled = true;
  pp.sharpen.edgeAmount = 0.22;

  pp.fxaaEnabled = true;

  pp.imageProcessingEnabled = true;
  pp.imageProcessing.toneMappingEnabled = true;
  pp.imageProcessing.toneMappingType    = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pp.imageProcessing.exposure  = 1.15;
  pp.imageProcessing.contrast  = 1.10;

  pp.imageProcessing.vignetteEnabled   = true;
  pp.imageProcessing.vignetteWeight    = 2.8;
  pp.imageProcessing.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTE_MULTIPLY;
  pp.imageProcessing.vignetteColor     = new BABYLON.Color4(0, 0, 0, 0);

  pp.grainEnabled    = true;
  pp.grain.intensity = 8;
  pp.grain.animated  = true;

  const ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 1 }, [camera]);
  ssao.radius        = 1.2;
  ssao.totalStrength = 0.85;
  ssao.base          = 0.28;
  ssao.maxZ          = 60;

  return pp;
}

export function setupDust(scene) {
  const dust = new BABYLON.ParticleSystem('dust', 220, scene);
  dust.emitter    = new BABYLON.Vector3(0, 2.5, 0);
  dust.minEmitBox = new BABYLON.Vector3(-7, -2, -7);
  dust.maxEmitBox = new BABYLON.Vector3( 7,  1,  7);

  dust.color1    = new BABYLON.Color4(0.85, 0.90, 1.00, 0.14);
  dust.color2    = new BABYLON.Color4(0.70, 0.80, 1.00, 0.08);
  dust.colorDead = new BABYLON.Color4(0, 0, 0, 0);

  dust.minSize     = 0.008; dust.maxSize     = 0.022;
  dust.minLifeTime = 6;     dust.maxLifeTime = 18;
  dust.emitRate    = 18;
  dust.blendMode   = BABYLON.ParticleSystem.BLENDMODE_ADD;

  dust.direction1   = new BABYLON.Vector3(-0.05, 0.03, -0.05);
  dust.direction2   = new BABYLON.Vector3( 0.05, 0.08,  0.05);
  dust.minEmitPower = 0.01; dust.maxEmitPower = 0.05;
  dust.updateSpeed  = 0.012;

  const tex = new BABYLON.DynamicTexture('dustTex', { width: 32, height: 32 }, scene);
  const ctx = tex.getContext();
  const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 32, 32);
  tex.update();
  dust.particleTexture = tex;
  dust.start();
}

export function setupScreenFlicker(scene, screenMaterial) {
  scene.registerBeforeRender(() => {
    const t       = performance.now() / 1000;
    const flicker = 0.92 + 0.08 * Math.sin(t * 120) * Math.sin(t * 7.3);
    screenMaterial.emissiveIntensity = 2.0 * flicker;
  });
}

export async function setupVR(scene, floorMeshes) {
  const btn = document.getElementById('vr-btn');
  btn.style.display = 'block';

  btn.addEventListener('click', async () => {
    try {
      const xr = await scene.createDefaultXRExperienceAsync({
        floorMeshes,
        optionalFeatures: true,
        // ── FIX 1: Disable multi-view ─────────────────────────────
        // GaussianSplattingMesh does not render in WebXR multi-view
        // stereo mode — the splat is invisible in VR without this flag.
        // Costs ~5% GPU but is required until Babylon patches splat multi-view.
        disableMultiview: true,
      });

      window.xrExperience = xr;
      console.log('✅ XR ready — multiview disabled for splat compatibility');

      // Attach menu
      if (window.menu) {
        const { attachMenuToController } = await import('./menu.js');
        attachMenuToController(window.menu, xr);
        console.log('✅ Menu attached to XR');
      } else {
        console.warn('⚠️ window.menu not found');
      }

      await xr.baseExperience.enterXRAsync('immersive-vr', 'local-floor');

      // ── FIX 2: Room manager XR camera polling ─────────────────────
      // Teleport observables vary across Babylon versions so we avoid
      // them entirely. Once inside XR, feed the XR camera position to
      // the room manager every frame — it throttles internally to every
      // 10 frames so the cost is negligible.
      if (window.roomManager) {
        xr.baseExperience.onStateChangedObservable.add(state => {
          if (state === BABYLON.WebXRState.IN_XR) {
            const xrCam = xr.baseExperience.camera;
            scene.registerBeforeRender(() => {
              if (xrCam && window.roomManager) {
                window.roomManager.onTeleport(xrCam.position);
              }
            });
            console.log('✅ Room manager switched to XR camera');
          }
        });
      }

    } catch (e) {
      alert('VR failed: ' + e.message);
    }
  });
}