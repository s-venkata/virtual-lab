// js/experiments/experiment_convexlens.js
// Optical Image Projection Using a Convex Lens (movable screen)
//
// Layout (inside datacenter room, center [22, 0, 0]):
//
//   [LAMP]--[SLIDE "F"]--light-->[CONVEX LENS]--converging rays-->[DISPLAY SCREEN]
//    fixed     fixed             drag X                            drag X
//
// Physics (thin lens):
//   1/f = 1/u + 1/v   =>   v_calc = 1 / ((1/f) - (1/u))
//   m = -v_actual / u            (signed magnification; negative = inverted)
//   focusError = |v_actual - v_calc|
//   sharpness  = max(0, 1 - focusError / FOCUS_TOLERANCE)
//
// Player interaction:
//   - The LIGHT SOURCE and OBJECT SLIDE are FIXED.
//   - Both the LENS and the DISPLAY SCREEN are GRABBABLE and slide along X.
//   - Lens clamp:   slideX + f + MARGIN  <=  lensX    <=  screenX - MARGIN
//   - Screen clamp: lensX + MARGIN       <=  screenX  <=  benchEnd - 0.3
//   - For each lens position, the user must move the screen to the plane where
//     v_actual ~ v_calc; sharpness rises and the image on the screen becomes
//     sharp. Image is rendered onto a DynamicTexture each frame:
//     scale(m, m) with signed m (inverts + mirrors); blur scales with error.
//   - Task completion requires BOTH the lens and the screen to have been moved
//     at least once, AND sharpness > 0.95.
//
// Networking:
//   - "lens"              : grab/release/transform
//   - "lens_screen"       : grab/release/transform
//   - "lens_focal_slider" : grab/release; ObjectState.value carries the
//                           normalized focal-length slider position [0..1].
//                           focalLen = FOCAL_MIN + value * (FOCAL_MAX - FOCAL_MIN)
//
// Returns { meshes } for roomManager registration.

import { BUILDING } from '../building.js';
import { makePickable } from '../pickup.js';
import {
  requestGrab, sendTransform, releaseObject,
  getMySessionId, getRoom, onObjectChange,
  onGrabAccepted, onGrabRejected,
} from '../network.js';

export function buildConvexLensExperiment(scene, shadow) {
  const meshes = [];
  const D      = BUILDING.datacenter;
  const cx     = D.center[0]; // 22
  const cy     = D.center[1]; // 0
  const cz     = D.center[2]; // 0

  // ââ Experiment parameters âââââââââââââââââââââââââââââââââââââââââ
  const benchY    = 1.0;
  const eyeY      = benchY + 0.35;
  const axisZ     = cz - 2.0;
  const FOCAL_MIN     = 1.0;   // 10 cm — slider minimum
  const FOCAL_MAX     = 2.5;   // 25 cm — slider maximum
  const FOCAL_DEFAULT = 1.5;   // 15 cm — matches server seed value 0.3333
  let   focalLen      = FOCAL_DEFAULT;  // live focal length (variable lens simulation)

  // ── Unit / physics constants ──────────────────────────────────────
  const SCENE_UNIT_TO_CM = 10;    // 1 scene unit = 10 cm on our optical bench
  const MARGIN           = 0.25;  // separation guard between draggable elements
  const FOCUS_TOLERANCE  = 1.0;   // sharpness -> 0 when |v_actual - v_calc| >= this
  const EPS              = 0.01;  // numerical guard for u > f

  // ── Bench bounds ──────────────────────────────────────────────────
  const benchStart = cx - 4.0; // 18
  const benchEnd   = cx + 4.0; // 26
  const benchLen   = benchEnd - benchStart;

  // ── Fixed positions ───────────────────────────────────────────────
  const lampX       = 18.3;
  const slideX      = 18.7;
  const screenInitX = 25.0;
  const lensInitX   = 22.0;

  // ── Lens drag lower bound — physical proximity guard only.
  //    Physics detects u <= focalLen and reports "No real image", so we do
  //    NOT clamp the lens to slideX + focalLen (that would make the lens
  //    jump when the slider changes focalLen).
  const lensMinX  = slideX + 0.3;
  const screenMaxX = benchEnd - 0.3;

  // 
  // MATERIALS
  //

  const benchMat = new BABYLON.PBRMaterial('cl_bench_mat', scene);
  benchMat.albedoColor = new BABYLON.Color3(0.25, 0.25, 0.28);
  benchMat.metallic    = 0.8;
  benchMat.roughness   = 0.35;

  const railMat = new BABYLON.PBRMaterial('cl_rail_mat', scene);
  railMat.albedoColor = new BABYLON.Color3(0.6, 0.6, 0.65);
  railMat.metallic    = 0.9;
  railMat.roughness   = 0.2;

  const standMat = new BABYLON.PBRMaterial('cl_stand_mat', scene);
  standMat.albedoColor = new BABYLON.Color3(0.3, 0.3, 0.32);
  standMat.metallic    = 0.7;
  standMat.roughness   = 0.4;

  const frameMat = new BABYLON.PBRMaterial('cl_frame_mat', scene);
  frameMat.albedoColor = new BABYLON.Color3(0.2, 0.2, 0.22);
  frameMat.metallic    = 0.85;
  frameMat.roughness   = 0.3;

  // Lens glass
  const lensMat = new BABYLON.PBRMaterial('cl_lens_mat', scene);
  lensMat.albedoColor    = new BABYLON.Color3(0.85, 0.95, 1.0);
  lensMat.alpha          = 0.45;
  lensMat.metallic       = 0.0;
  lensMat.roughness      = 0.05;
  lensMat.backFaceCulling = false;

  // Lamp body
  const lampMat = new BABYLON.PBRMaterial('cl_lamp_mat', scene);
  lampMat.albedoColor = new BABYLON.Color3(0.18, 0.18, 0.2);
  lampMat.metallic    = 0.7;
  lampMat.roughness   = 0.4;

  // Lamp glow
  const lampGlowMat = new BABYLON.PBRMaterial('cl_lamp_glow_mat', scene);
  lampGlowMat.albedoColor       = new BABYLON.Color3(1, 0.95, 0.85);
  lampGlowMat.emissiveColor     = new BABYLON.Color3(1, 0.95, 0.85);
  lampGlowMat.emissiveIntensity = 4.0;

  // Screen base material (the DynamicTexture is set later)
  // Slide base material (DynamicTexture set later)

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // OPTICAL BENCH
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const bench = BABYLON.MeshBuilder.CreateBox('cl_bench', {
    width: benchLen + 0.4, height: 0.06, depth: 0.7,
  }, scene);
  bench.position.set(cx, benchY - 0.03, axisZ);
  bench.material        = benchMat;
  bench.checkCollisions = false;
  bench.receiveShadows  = true;
  if (shadow) shadow.addShadowCaster(bench, true);
  meshes.push(bench);

  [-0.12, 0.12].forEach((zOff, i) => {
    const rail = BABYLON.MeshBuilder.CreateBox(`cl_rail_${i}`, {
      width: benchLen, height: 0.03, depth: 0.04,
    }, scene);
    rail.position.set(cx, benchY + 0.015, axisZ + zOff);
    rail.material        = railMat;
    rail.checkCollisions = false;
    meshes.push(rail);
  });

  [benchStart + 0.5, benchEnd - 0.5].forEach((x, i) => {
    const leg = BABYLON.MeshBuilder.CreateBox(`cl_leg_${i}`, {
      width: 0.08, height: benchY - 0.03, depth: 0.5,
    }, scene);
    leg.position.set(x, (benchY - 0.03) / 2, axisZ);
    leg.material        = standMat;
    leg.checkCollisions = false;
    meshes.push(leg);
  });

  // Ruler markings (cm scale)
  const scaleTex = new BABYLON.DynamicTexture('cl_scale_tex',
    { width: 1024, height: 64 }, scene, true);
  const scaleCtx = scaleTex.getContext();
  scaleCtx.fillStyle = '#222222';
  scaleCtx.fillRect(0, 0, 1024, 64);
  scaleCtx.strokeStyle = '#ffffff';
  scaleCtx.lineWidth = 1;
  scaleCtx.fillStyle = '#ffffff';
  scaleCtx.font = '14px monospace';
  scaleCtx.textAlign = 'center';
  for (let i = 0; i <= 80; i++) {
    const x = (i / 80) * 1024;
    const isMajor = i % 10 === 0;
    const isMid   = i % 5 === 0;
    scaleCtx.beginPath();
    scaleCtx.moveTo(x, 0);
    scaleCtx.lineTo(x, isMajor ? 40 : isMid ? 28 : 16);
    scaleCtx.stroke();
    if (isMajor) scaleCtx.fillText(`${i}`, x, 58);
  }
  scaleTex.update();

  const scaleMatl = new BABYLON.StandardMaterial('cl_scale_mat', scene);
  scaleMatl.diffuseTexture  = scaleTex;
  scaleMatl.emissiveColor   = new BABYLON.Color3(0.3, 0.3, 0.3);

  const scalePlane = BABYLON.MeshBuilder.CreatePlane('cl_scale', {
    width: benchLen, height: 0.08,
  }, scene);
  scalePlane.position.set(cx, benchY + 0.001, axisZ + 0.25);
  scalePlane.rotation.x      = Math.PI / 2;
  scalePlane.material        = scaleMatl;
  scalePlane.checkCollisions = false;
  meshes.push(scalePlane);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // LAMP (fixed)
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const lamp = BABYLON.MeshBuilder.CreateBox('cl_lamp', {
    width: 0.3, height: 0.3, depth: 0.3,
  }, scene);
  lamp.position.set(lampX, eyeY, axisZ);
  lamp.material        = lampMat;
  lamp.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(lamp, true);
  meshes.push(lamp);

  const lampFace = BABYLON.MeshBuilder.CreateDisc('cl_lamp_face', {
    radius: 0.1, tessellation: 24,
  }, scene);
  lampFace.position.set(lampX + 0.16, eyeY, axisZ);
  lampFace.rotation.y      = -Math.PI / 2;
  lampFace.material        = lampGlowMat;
  lampFace.checkCollisions = false;
  meshes.push(lampFace);

  // Lamp post
  const lampPost = BABYLON.MeshBuilder.CreateCylinder('cl_lamp_post', {
    diameter: 0.04, height: eyeY - benchY, tessellation: 12,
  }, scene);
  lampPost.position.set(lampX, benchY + (eyeY - benchY) / 2, axisZ);
  lampPost.material        = standMat;
  lampPost.checkCollisions = false;
  meshes.push(lampPost);

  // Point light for ambient effect — parented so it disposes with the room
  const lampLightRoot = new BABYLON.TransformNode('cl_lamp_light_root', scene);
  meshes.push(lampLightRoot);
  const lampLight = new BABYLON.PointLight('cl_lamp_light',
    new BABYLON.Vector3(lampX + 0.4, eyeY, axisZ), scene);
  lampLight.parent    = lampLightRoot;
  lampLight.intensity = 0.4;
  lampLight.range     = 1.5;
  lampLight.diffuse   = new BABYLON.Color3(1, 0.95, 0.8);

  _makeLabel(scene, 'LAMP', lampX, eyeY + 0.3, axisZ, meshes, 'lamp');

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // SLIDE (object â letter "F"), fixed
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const slideTex = new BABYLON.DynamicTexture('cl_slide_tex',
    { width: 256, height: 256 }, scene, true);
  const sCtx = slideTex.getContext();
  sCtx.fillStyle = '#000';
  sCtx.fillRect(0, 0, 256, 256);
  sCtx.fillStyle = '#fff8b0';
  sCtx.font = 'bold 200px serif';
  sCtx.textAlign = 'center';
  sCtx.textBaseline = 'middle';
  sCtx.fillText('F', 128, 128);
  slideTex.update();

  const slideMat = new BABYLON.StandardMaterial('cl_slide_mat', scene);
  slideMat.emissiveTexture  = slideTex;
  slideMat.diffuseTexture   = slideTex;
  slideMat.disableLighting  = true;
  slideMat.backFaceCulling  = false;

  const slidePlane = BABYLON.MeshBuilder.CreatePlane('cl_slide', {
    width: 0.32, height: 0.32,
  }, scene);
  slidePlane.position.set(slideX, eyeY, axisZ);
  slidePlane.rotation.y      = -Math.PI / 2; // face the lens (+X)
  slidePlane.material        = slideMat;
  slidePlane.checkCollisions = false;
  meshes.push(slidePlane);

  // Slide frame
  const slideFrame = BABYLON.MeshBuilder.CreateBox('cl_slide_frame', {
    width: 0.04, height: 0.4, depth: 0.4,
  }, scene);
  slideFrame.position.set(slideX - 0.02, eyeY, axisZ);
  slideFrame.material        = frameMat;
  slideFrame.checkCollisions = false;
  meshes.push(slideFrame);

  // Slide post removed — the slide frame anchors the slide; the post blocked
  // the F glyph from the lens side.

  _makeLabel(scene, 'OBJECT (F)', slideX, eyeY + 0.32, axisZ, meshes, 'slide');

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // CONVEX LENS (draggable)
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const lensRoot = new BABYLON.TransformNode('cl_lens_root', scene);
  lensRoot.position.set(lensInitX, eyeY, axisZ);
  meshes.push(lensRoot);

  const lensFront = BABYLON.MeshBuilder.CreateSphere('cl_lens_front', {
    diameter: 0.5, segments: 32, slice: 0.18,
  }, scene);
  lensFront.parent     = lensRoot;
  lensFront.rotation.z = -Math.PI / 2;
  lensFront.material   = lensMat;
  lensFront.checkCollisions = false;
  meshes.push(lensFront);

  const lensBack = BABYLON.MeshBuilder.CreateSphere('cl_lens_back', {
    diameter: 0.5, segments: 32, slice: 0.18,
  }, scene);
  lensBack.parent     = lensRoot;
  lensBack.rotation.z = Math.PI / 2;
  lensBack.material   = lensMat;
  lensBack.checkCollisions = false;
  meshes.push(lensBack);

  const lensRing = BABYLON.MeshBuilder.CreateTorus('cl_lens_ring', {
    diameter: 0.5, thickness: 0.025, tessellation: 48,
  }, scene);
  lensRing.parent     = lensRoot;
  lensRing.rotation.z = Math.PI / 2;
  lensRing.material   = frameMat;
  lensRing.checkCollisions = false;
  meshes.push(lensRing);

  const lensPost = BABYLON.MeshBuilder.CreateCylinder('cl_lens_post', {
    diameter: 0.04, height: eyeY - benchY, tessellation: 12,
  }, scene);
  lensPost.parent     = lensRoot;
  lensPost.position.y = -(eyeY - benchY) / 2;
  lensPost.material   = standMat;
  lensPost.checkCollisions = false;
  meshes.push(lensPost);

  const lensSlider = BABYLON.MeshBuilder.CreateBox('cl_lens_slider', {
    width: 0.14, height: 0.05, depth: 0.32,
  }, scene);
  lensSlider.parent     = lensRoot;
  lensSlider.position.y = -(eyeY - benchY) + 0.025;
  lensSlider.material   = railMat;
  lensSlider.checkCollisions = false;
  meshes.push(lensSlider);

  // Live lens label — shows CONVEX LENS + current focal length. Redraws
  // when focalLen changes appreciably.
  const lensLabel = _makeDynamicLabel(scene, lensInitX, eyeY + 0.45, axisZ,
                                      meshes, 'lens', lensRoot,
                                      { width: 320, height: 128 },
                                      { planeW: 0.72, planeH: 0.28 });
  function _redrawLensLabel(f) {
    const ctx = lensLabel.tex.getContext();
    ctx.clearRect(0, 0, 320, 128);
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONVEX LENS', 160, 42);
    ctx.fillStyle = '#ffdd00';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(`f = ${(f * SCENE_UNIT_TO_CM).toFixed(1)} cm`, 160, 82);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '13px monospace';
    ctx.fillText('(GRAB & SLIDE)', 160, 108);
    lensLabel.tex.update();
  }
  _redrawLensLabel(focalLen);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // SCREEN (fixed) â projected image rendered to its DynamicTexture
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const SCREEN_TEX_W = 512;
  const SCREEN_TEX_H = 512;
  const screenTex = new BABYLON.DynamicTexture('cl_screen_tex',
    { width: SCREEN_TEX_W, height: SCREEN_TEX_H }, scene, true);

  const screenMat = new BABYLON.StandardMaterial('cl_screen_mat', scene);
  screenMat.emissiveTexture  = screenTex;
  screenMat.diffuseTexture   = screenTex;
  screenMat.disableLighting  = true;
  screenMat.backFaceCulling  = false;

  const screenW = 0.7;
  const screenH = 0.7;

  // Screen root transform — grabbable and slides along X
  const screenRoot = new BABYLON.TransformNode('cl_screen_root', scene);
  screenRoot.position.set(screenInitX, eyeY, axisZ);
  meshes.push(screenRoot);

  const screenPanel = BABYLON.MeshBuilder.CreatePlane('cl_screen_panel', {
    width: screenW, height: screenH,
  }, scene);
  screenPanel.parent          = screenRoot;
  screenPanel.position.set(0, 0, 0);
  screenPanel.rotation.y      = -Math.PI / 2; // faces lens
  screenPanel.material        = screenMat;
  screenPanel.checkCollisions = false;
  meshes.push(screenPanel);

  // Screen frame
  const screenFrame = BABYLON.MeshBuilder.CreateBox('cl_screen_frame', {
    width: 0.05, height: screenH + 0.08, depth: screenW + 0.08,
  }, scene);
  screenFrame.parent          = screenRoot;
  screenFrame.position.set(0.03, 0, 0);
  screenFrame.material        = frameMat;
  screenFrame.checkCollisions = false;
  if (shadow) shadow.addShadowCaster(screenFrame, true);
  meshes.push(screenFrame);

  // Screen post removed — the screenSlider rail base anchors the screen;
  // the post blocked the projected image from the lens side.

  // Screen slider (mirrors the lens slider)
  const screenSlider = BABYLON.MeshBuilder.CreateBox('cl_screen_slider', {
    width: 0.14, height: 0.05, depth: 0.32,
  }, scene);
  screenSlider.parent          = screenRoot;
  screenSlider.position.y      = -(eyeY - benchY) + 0.025;
  screenSlider.material        = railMat;
  screenSlider.checkCollisions = false;
  meshes.push(screenSlider);

  _makeLabel(scene, 'DISPLAY SCREEN\n(GRAB & SLIDE)', screenInitX, eyeY + 0.45, axisZ, meshes, 'scr', screenRoot);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // READOUT PANEL
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const panelW = 2.0;
  const panelH = 1.2;
  const panelTex = new BABYLON.DynamicTexture('cl_panel_tex',
    { width: 600, height: 360 }, scene, true);
  const panelMat = new BABYLON.StandardMaterial('cl_panel_mat', scene);
  panelMat.emissiveTexture = panelTex;
  panelMat.diffuseTexture  = panelTex;
  panelMat.disableLighting = true;

  const panel = BABYLON.MeshBuilder.CreatePlane('cl_panel', {
    width: panelW, height: panelH,
  }, scene);
  panel.position.set(cx + 2, 2.2, D.center[2] - D.size[2] / 2 + 0.05);
  panel.material        = panelMat;
  panel.checkCollisions = false;
  meshes.push(panel);

  const panelFrame = BABYLON.MeshBuilder.CreateBox('cl_panel_frame', {
    width: panelW + 0.06, height: panelH + 0.06, depth: 0.03,
  }, scene);
  panelFrame.position.set(cx + 2, 2.2, D.center[2] - D.size[2] / 2 + 0.02);
  panelFrame.material        = frameMat;
  panelFrame.checkCollisions = false;
  meshes.push(panelFrame);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // INFO BOARD
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const infoTex = new BABYLON.DynamicTexture('cl_info_tex',
    { width: 600, height: 320 }, scene, true);
  const infoCtx = infoTex.getContext();
  infoCtx.fillStyle = '#0a1628';
  infoCtx.fillRect(0, 0, 600, 320);
  infoCtx.fillStyle = '#00e5ff';
  infoCtx.font = 'bold 22px monospace';
  infoCtx.textAlign = 'center';
  infoCtx.fillText('OPTICAL IMAGE PROJECTION', 300, 30);
  infoCtx.fillStyle = '#ffffff';
  infoCtx.font = '16px monospace';
  infoCtx.fillText('Thin Lens Formula:', 300, 56);
  infoCtx.fillStyle = '#ffdd00';
  infoCtx.font = 'bold 20px monospace';
  infoCtx.fillText('1/f = 1/u + 1/v', 300, 82);
  infoCtx.fillStyle = '#aaaaaa';
  infoCtx.font = '14px monospace';
  infoCtx.textAlign = 'left';
  infoCtx.fillText('- Slide the LENS and the SCREEN along the bench', 30, 108);
  infoCtx.fillText('- Image is REAL, INVERTED, and may be magnified',   30, 126);
  infoCtx.fillText('- Sharpness peaks when v_actual = v_calc',          30, 144);
  infoCtx.fillText('- f is variable via slider (10-25 cm)',             30, 162);
  infoCtx.fillText('   u = object distance    v = image distance',      30, 180);
  infoCtx.fillText('- Total distance:  D = u + v',                      30, 198);
  infoCtx.fillText("- Magnification:   Y'/Y = m = -v/u  (inverted)",    30, 216);
  infoCtx.fillText('- Changing f changes the required image distance v.',30, 234);
  // D >= 4f educational note (whiteboard condition)
  infoCtx.fillStyle = '#ffaa88';
  infoCtx.font = 'italic 12px monospace';
  infoCtx.fillText('Note: For a fixed object-screen distance D, two sharp lens', 30, 262);
  infoCtx.fillText('      positions exist only when D >= 4f. Here the display',  30, 280);
  infoCtx.fillText('      screen is movable, so D changes during focusing.',     30, 298);
  infoTex.update();

  const infoMat = new BABYLON.StandardMaterial('cl_info_mat', scene);
  infoMat.emissiveTexture = infoTex;
  infoMat.diffuseTexture  = infoTex;
  infoMat.disableLighting = true;

  const infoBoard = BABYLON.MeshBuilder.CreatePlane('cl_info_board', {
    width: 2.4, height: 1.0,
  }, scene);
  infoBoard.position.set(cx - 2, 2.2, D.center[2] - D.size[2] / 2 + 0.05);
  infoBoard.material        = infoMat;
  infoBoard.checkCollisions = false;
  meshes.push(infoBoard);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // TASK SIGN
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  // const taskTex = new BABYLON.DynamicTexture('cl_task_tex',
  //   { width: 512, height: 128 }, scene, true);
  // const taskCtx = taskTex.getContext();
  // taskCtx.fillStyle = '#001133';
  // taskCtx.fillRect(0, 0, 512, 128);
  // taskCtx.fillStyle = '#00e5ff';
  // taskCtx.font = 'bold 22px monospace';
  // taskCtx.textAlign = 'center';
  // taskCtx.fillText('TASK: Project a sharp inverted image of F', 256, 48);
  // taskCtx.fillStyle = '#aaaaaa';
  // taskCtx.font = '18px monospace';
  // taskCtx.fillText('Slide the LENS and the SCREEN along the bench', 256, 82);
  // taskCtx.fillStyle = '#ffdd00';
  // taskCtx.font = '16px monospace';
  // taskCtx.fillText('Both must be moved before the task can complete.', 256, 112);
  // taskTex.update();

  // const taskMat = new BABYLON.StandardMaterial('cl_task_mat', scene);
  // taskMat.emissiveTexture = taskTex;
  // taskMat.diffuseTexture  = taskTex;
  // taskMat.disableLighting = true;
  // taskMat.backFaceCulling = true;   // one-sided rendering; back face invisible

  // const taskSign = BABYLON.MeshBuilder.CreatePlane('cl_task_sign', {
  //   width: 2.4, height: 0.6,
  //   sideOrientation: BABYLON.Mesh.FRONTSIDE,
  // }, scene);
  // taskSign.position.set(cx, 2.85, axisZ - 0.3);
  // taskSign.rotation.x      = -0.15;
  // taskSign.material        = taskMat;
  // taskSign.checkCollisions = false;
  // taskSign.isPickable      = false;   // informational only; excluded from raycasts/grabs
  // meshes.push(taskSign);

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // ─────────────────────────────────────────────────────────────────
  // NETWORK STATE — lens and lens_screen
  // ─────────────────────────────────────────────────────────────────

  let _hl = null;
  const _COLOR_MINE  = new BABYLON.Color3(0.2, 1.0, 0.3);
  const _COLOR_OTHER = new BABYLON.Color3(0.2, 0.5, 1.0);

  function _getHL() {
    if (!_hl) {
      _hl = new BABYLON.HighlightLayer('cl_hl', scene);
      _hl.innerGlow = false;
      _hl.outerGlow = true;
    }
    return _hl;
  }
  function _setHL(meshList, color) {
    const hl = _getHL();
    meshList.forEach(m => { hl.removeMesh(m); hl.addMesh(m, color); });
  }
  function _removeHL(meshList) {
    if (_hl) meshList.forEach(m => _hl.removeMesh(m));
  }

  // Movement latches — must both be true (with sharpness > 0.95) to complete
  let lensMoved   = false;
  let screenMoved = false;

  // Shared draggable wiring — reusable for any object with a TransformNode root
  function _wireDraggable(root, hlMeshes, objectId, onFirstMove) {
    const state = {
      grabbed:  false,
      pending:  false,
      netSetup: false,
      lastSend: 0,
      savedPos: root.position.clone(),
    };

    makePickable(scene, root, {
      snapToSurface: false,
      rotateOnDrag:  false,
      highlight:     true,
      onPickup: () => {
        state.savedPos = root.position.clone();
        setupNet();
        const ok = requestGrab(objectId);
        if (!ok) return;
        state.pending = true;
        state.grabbed = true;
        if (onFirstMove) onFirstMove();
      },
      onDrop: () => {
        if (state.grabbed) {
          if (!state.pending) {
            sendTransform(objectId, root.position, { x: 0, y: 0, z: 0 });
          }
          releaseObject(objectId);
        }
        state.pending = false;
        state.grabbed = false;
      },
    });

    function setupNet() {
      if (state.netSetup) return;

      const accepted = onGrabAccepted(({ objectId: id }) => {
        if (id !== objectId) return;
        state.pending = false;
      });
      const rejected = onGrabRejected(({ objectId: id }) => {
        if (id !== objectId) return;
        state.pending = false;
        state.grabbed = false;
        root.position.copyFrom(state.savedPos);
      });
      const changed = onObjectChange(objectId, (s) => {
        const myId = getMySessionId();
        if (s.ownerId === myId) {
          _setHL(hlMeshes, _COLOR_MINE);
          return;
        }
        if (s.ownerId !== "") {
          _setHL(hlMeshes, _COLOR_OTHER);
        } else {
          _removeHL(hlMeshes);
        }
        root.position.set(s.x, s.y, s.z);
      });

      if (accepted && rejected && changed) state.netSetup = true;
    }

    setupNet();
    return state;
  }

  const lensNet   = _wireDraggable(lensRoot,   [lensFront, lensBack, lensRing], "lens",        () => { lensMoved   = true; });
  const screenNet = _wireDraggable(screenRoot, [screenPanel, screenFrame],     "lens_screen", () => { screenMoved = true; });

  // ─────────────────────────────────────────────────────────────────
  // FOCAL-LENGTH SLIDER (variable-f lens simulation)
  // Root/backplate/rail stay fixed. Only the knob moves.
  // Network object id: "lens_focal_slider" — ObjectState.value carries
  //   the normalized slider position in [0, 1].
  // ─────────────────────────────────────────────────────────────────

  const SLIDER_RAIL_HALF = 0.15;   // rail spans local X in [-0.15, +0.15]
  const SLIDER_ANCHOR_X  = 25.0;             // centered under the display screen (screenInitX)
  const SLIDER_ANCHOR_Y  = benchY   + 0.10;  // 1.10  (10 cm above bench top)
  const SLIDER_ANCHOR_Z  = axisZ    + 0.45;  // -1.55 (45 cm forward of bench axis)

  const focalRoot = new BABYLON.TransformNode('cl_focal_root', scene);
  focalRoot.position.set(SLIDER_ANCHOR_X, SLIDER_ANCHOR_Y, SLIDER_ANCHOR_Z);
  meshes.push(focalRoot);

  const focalBackMat = new BABYLON.PBRMaterial('cl_focal_back_mat', scene);
  focalBackMat.albedoColor = new BABYLON.Color3(0.10, 0.10, 0.11);
  focalBackMat.metallic    = 0.2;
  focalBackMat.roughness   = 0.85;

  const focalRailMat = new BABYLON.PBRMaterial('cl_focal_rail_mat', scene);
  focalRailMat.albedoColor = new BABYLON.Color3(0.28, 0.28, 0.32);
  focalRailMat.metallic    = 0.9;
  focalRailMat.roughness   = 0.35;

  const focalKnobMat = new BABYLON.PBRMaterial('cl_focal_knob_mat', scene);
  focalKnobMat.albedoColor   = new BABYLON.Color3(0.95, 0.72, 0.15);
  focalKnobMat.emissiveColor = new BABYLON.Color3(0.08, 0.06, 0.01);
  focalKnobMat.metallic      = 0.35;
  focalKnobMat.roughness     = 0.4;

  const focalBackplate = BABYLON.MeshBuilder.CreateBox('cl_focal_backplate', {
    width: 0.36, height: 0.16, depth: 0.015,
  }, scene);
  focalBackplate.parent          = focalRoot;
  focalBackplate.position.set(0, 0, -0.011);
  focalBackplate.material        = focalBackMat;
  focalBackplate.checkCollisions = false;
  meshes.push(focalBackplate);

  const focalRail = BABYLON.MeshBuilder.CreateBox('cl_focal_rail', {
    width: 0.30, height: 0.015, depth: 0.02,
  }, scene);
  focalRail.parent          = focalRoot;
  focalRail.position.set(0, 0, 0.004);
  focalRail.material        = focalRailMat;
  focalRail.checkCollisions = false;
  meshes.push(focalRail);

  const focalKnob = BABYLON.MeshBuilder.CreateSphere('cl_focal_knob', {
    diameter: 0.05, segments: 16,
  }, scene);
  focalKnob.parent          = focalRoot;
  // Initial knob X derived from the default focal length; may be overwritten
  // immediately by the server-seed onObjectChange callback.
  const _valueFromFocal = (f) => (f - FOCAL_MIN) / (FOCAL_MAX - FOCAL_MIN);
  const _focalFromValue = (v) => FOCAL_MIN + v * (FOCAL_MAX - FOCAL_MIN);
  focalKnob.position.set(-SLIDER_RAIL_HALF + _valueFromFocal(focalLen) * (2 * SLIDER_RAIL_HALF), 0.015, 0.014);
  focalKnob.material        = focalKnobMat;
  focalKnob.checkCollisions = false;
  meshes.push(focalKnob);

  // Slider status label — separate from the lens label. Repainted whenever
  // focalLen changes.
  const sliderLabel = _makeDynamicLabel(scene, SLIDER_ANCHOR_X, SLIDER_ANCHOR_Y + 0.115, SLIDER_ANCHOR_Z,
                                        meshes, 'focal_slider', focalRoot,
                                        { width: 256, height: 96 },
                                        { planeW: 0.36, planeH: 0.11 });
  function _redrawSliderLabel(f) {
    const ctx = sliderLabel.tex.getContext();
    ctx.clearRect(0, 0, 256, 96);
    ctx.fillStyle = '#00c8dd';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FOCAL LENGTH', 128, 22);
    ctx.fillStyle = '#ffcc55';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`f = ${(f * SCENE_UNIT_TO_CM).toFixed(1)} cm`, 128, 52);
    ctx.fillStyle = '#7a8a8a';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('10 cm', 14, 82);
    ctx.textAlign = 'right';
    ctx.fillText('25 cm', 242, 82);
    sliderLabel.tex.update();
  }
  _redrawSliderLabel(focalLen);

  // Slider networking state (custom because it uses .value, not .position)
  const focalSliderNet = {
    grabbed:  false,
    pending:  false,
    netSetup: false,
    lastSend: 0,
    savedX:   focalKnob.position.x,
    // Track last value we sent so we don't re-echo state we received.
    lastSentValue: -1,
  };
  const _FOCAL_HL = [focalKnob];

  makePickable(scene, focalKnob, {
    snapToSurface: false,
    rotateOnDrag:  false,
    highlight:     true,
    onPickup: () => {
      focalSliderNet.savedX = focalKnob.position.x;
      _setupFocalSliderNet();
      const ok = requestGrab("lens_focal_slider");
      if (!ok) return;
      focalSliderNet.pending = true;
      focalSliderNet.grabbed = true;
    },
    onDrop: () => {
      if (focalSliderNet.grabbed) {
        if (!focalSliderNet.pending) {
          const v = _valueFromFocal(focalLen);
          sendTransform("lens_focal_slider", focalKnob.getAbsolutePosition(), { x: 0, y: 0, z: 0 }, v);
        }
        releaseObject("lens_focal_slider");
      }
      focalSliderNet.pending = false;
      focalSliderNet.grabbed = false;
    },
  });

  function _setupFocalSliderNet() {
    if (focalSliderNet.netSetup) return;
    const accepted = onGrabAccepted(({ objectId: id }) => {
      if (id !== "lens_focal_slider") return;
      focalSliderNet.pending = false;
    });
    const rejected = onGrabRejected(({ objectId: id }) => {
      if (id !== "lens_focal_slider") return;
      focalSliderNet.pending = false;
      focalSliderNet.grabbed = false;
      focalKnob.position.x = focalSliderNet.savedX;
    });
    const changed = onObjectChange("lens_focal_slider", (s) => {
      const myId = getMySessionId();
      // Highlight color reflects ownership; knob position/focalLen mirrored
      // for peers, but the local owner already has authoritative state.
      if (s.ownerId === myId) {
        _setHL(_FOCAL_HL, _COLOR_MINE);
        return;
      }
      if (s.ownerId !== "") {
        _setHL(_FOCAL_HL, _COLOR_OTHER);
      } else {
        _removeHL(_FOCAL_HL);
      }
      const v = Math.max(0, Math.min(1, Number.isFinite(s.value) ? s.value : 0));
      focalKnob.position.x = -SLIDER_RAIL_HALF + v * (2 * SLIDER_RAIL_HALF);
      focalLen = _focalFromValue(v);
    });
    if (accepted && rejected && changed) focalSliderNet.netSetup = true;
  }
  _setupFocalSliderNet();

  // ─────────────────────────────────────────────────────────────────
  // PHYSICS LOOP
  // ─────────────────────────────────────────────────────────────────

  let taskComplete    = false;
  let lastDrawnSig    = '';
  let successRefs     = null;  // { sign, tex }
  let currentlyFocused = false;
  let lastFocalRendered = -1;  // triggers first-frame label paint via mismatch

  scene.registerBeforeRender(() => {
    // Lock both roots to the bench axis on Y/Z
    lensRoot.position.y   = eyeY;
    lensRoot.position.z   = axisZ;
    screenRoot.position.y = eyeY;
    screenRoot.position.z = axisZ;

    // ── Focal slider knob: clamp to rail; derive focalLen for owner ──
    // Keep the root/backplate/rail fixed. Only the knob local X moves.
    focalKnob.position.y = 0.015;
    focalKnob.position.z = 0.014;
    focalKnob.position.x = Math.max(-SLIDER_RAIL_HALF,
                                    Math.min(SLIDER_RAIL_HALF, focalKnob.position.x));
    if (focalSliderNet.grabbed) {
      // Local drag is authoritative for the owner
      const knobValue = (focalKnob.position.x + SLIDER_RAIL_HALF) / (2 * SLIDER_RAIL_HALF);
      focalLen = _focalFromValue(knobValue);
    }

    // Repaint the lens + slider labels when focalLen changes appreciably
    if (Math.abs(focalLen - lastFocalRendered) > 0.005) {
      _redrawLensLabel(focalLen);
      _redrawSliderLabel(focalLen);
      lastFocalRendered = focalLen;
    }

    // Dynamic clamps — both actors constrain each other
    const dynLensMax   = screenRoot.position.x - MARGIN;
    const dynScreenMin = lensRoot.position.x   + MARGIN;
    lensRoot.position.x   = Math.max(lensMinX,   Math.min(dynLensMax,   lensRoot.position.x));
    screenRoot.position.x = Math.max(dynScreenMin, Math.min(screenMaxX, screenRoot.position.x));

    // Thin-lens physics
    const u        = lensRoot.position.x - slideX;
    const v_actual = screenRoot.position.x - lensRoot.position.x;
    const dActual  = u + v_actual;
    let   v_calc    = NaN;      // NaN-safe sentinel until proven real
    let   mTheory   = 0;        // theoretical magnification -v_calc / u
    let   mScreen   = 0;        // screen-plane scaling     -v_actual / u
    let   imageReal = false;
    if (u > focalLen + EPS) {
      const vc = 1 / ((1 / focalLen) - (1 / u));
      if (vc > 0 && isFinite(vc)) {
        v_calc    = vc;
        mTheory   = -v_calc   / u;
        mScreen   = -v_actual / u;
        imageReal = true;
      }
    }
    const error      = imageReal ? Math.abs(v_actual - v_calc) : 999;
    const sharpness  = imageReal ? Math.max(0, 1 - error / FOCUS_TOLERANCE) : 0;
    const blurPx     = (1 - sharpness) * 12;
    const brightness = Math.max(0.15, 0.4 + sharpness * 0.6);
    currentlyFocused = imageReal && sharpness > 0.95;

    // Screen bitmap — only redraw when something changes.
    // Size is set by mTheory (real image size at v_calc); blur is set by
    // |v_actual - v_calc| via blurPx. This keeps physics correct: the image
    // itself has a fixed size, we're just intercepting it at a different plane.
    // focalLen is included so a slider change triggers a redraw immediately.
    const sig = `${u.toFixed(3)}|${v_actual.toFixed(3)}|${focalLen.toFixed(3)}|${mTheory.toFixed(3)}|${sharpness.toFixed(3)}`;
    if (sig !== lastDrawnSig) {
      _drawScreenImage(screenTex, mTheory, blurPx, brightness, imageReal);
      lastDrawnSig = sig;
    }

    // Readout panel (scene units → cm)
    const u_cm        = (u        * SCENE_UNIT_TO_CM).toFixed(1);
    const v_calc_cm   = imageReal ? (v_calc   * SCENE_UNIT_TO_CM).toFixed(1) : '—';
    const v_actual_cm = (v_actual * SCENE_UNIT_TO_CM).toFixed(1);
    const d_actual_cm = (dActual  * SCENE_UNIT_TO_CM).toFixed(1);
    const f_cm        = (focalLen * SCENE_UNIT_TO_CM).toFixed(1);
    const error_cm    = imageReal ? (error * SCENE_UNIT_TO_CM).toFixed(1) : '—';
    _updatePanel(panelTex, u_cm, v_calc_cm, v_actual_cm, d_actual_cm, f_cm, error_cm,
                 mTheory, sharpness, imageReal, taskComplete,
                 lensMoved, screenMoved);

    // Network streaming — ~20 Hz per grabbed actor
    const now = performance.now();
    if (lensNet.grabbed && !lensNet.pending && now - lensNet.lastSend > 50) {
      sendTransform("lens", lensRoot.position, { x: 0, y: 0, z: 0 });
      lensNet.lastSend = now;
    }
    if (screenNet.grabbed && !screenNet.pending && now - screenNet.lastSend > 50) {
      sendTransform("lens_screen", screenRoot.position, { x: 0, y: 0, z: 0 });
      screenNet.lastSend = now;
    }
    if (focalSliderNet.grabbed && !focalSliderNet.pending && now - focalSliderNet.lastSend > 50) {
      const v = _valueFromFocal(focalLen);
      // Position payload is ignored by peers for this object; we still send
      // the knob's world position so the server has consistent record.
      sendTransform("lens_focal_slider", focalKnob.getAbsolutePosition(), { x: 0, y: 0, z: 0 }, v);
      focalSliderNet.lastSend      = now;
      focalSliderNet.lastSentValue = v;
    }

    // Task completion — requires BOTH actors moved and a sharp image
    if (!taskComplete && lensMoved && screenMoved && currentlyFocused) {
      taskComplete = true;
      successRefs  = _showSuccess(scene, cx, eyeY, axisZ, meshes, u_cm, v_actual_cm, v_calc_cm, f_cm, mTheory);
      console.log(`[convex-lens] Sharp image! u=${u_cm}cm v_actual=${v_actual_cm}cm v_calc=${v_calc_cm}cm m=${mTheory.toFixed(2)}x`);
    }
    // After latch, keep the sign live — dim palette when defocused
    if (taskComplete && successRefs) {
      _updateSuccessSign(successRefs.tex, currentlyFocused, u_cm, v_actual_cm, v_calc_cm, f_cm, mTheory);
    }
  });

  console.log('[convex-lens] image-projection experiment built in datacenter');
  return { meshes };
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// HELPERS
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function _drawScreenImage(tex, m, blurPx, brightness, imageReal) {
  const ctx = tex.getContext();
  const W   = tex.getSize().width;
  const H   = tex.getSize().height;

  // Reset from previous frame
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, W, H);

  if (!imageReal) {
    ctx.fillStyle = '#888';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('- no real image -', W / 2, H / 2);
    tex.update();
    return;
  }

  // Clamp magnification visually so very large m does not escape the canvas
  const visM = Math.max(-3.5, Math.min(3.5, m));
  const supportsFilter = ('filter' in ctx);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(visM, visM);
  ctx.globalAlpha = brightness;
  ctx.fillStyle = 'rgba(255, 245, 190, 1)';
  ctx.font = 'bold 200px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (blurPx > 0.1 && supportsFilter) {
    // Native canvas blur
    ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    ctx.fillText('F', 0, 0);
    ctx.filter = 'none';
  } else if (blurPx > 0.1) {
    // Multi-draw jitter fallback for renderers without ctx.filter
    const samples = 8;
    const radius  = blurPx * 0.6;
    const perAlpha = brightness / samples;
    ctx.globalAlpha = perAlpha;
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const dx = Math.cos(a) * radius;
      const dy = Math.sin(a) * radius;
      ctx.fillText('F', dx, dy);
    }
    // Sharp center pass for definition
    ctx.globalAlpha = brightness * 0.35;
    ctx.fillText('F', 0, 0);
  } else {
    ctx.fillText('F', 0, 0);
  }

  ctx.restore();
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.globalAlpha = 1;

  tex.update();
}

function _updatePanel(tex, u_cm, v_calc_cm, v_actual_cm, d_actual_cm, f_cm, error_cm,
                      mTheory, sharpness, imageReal, complete,
                      lensMoved, screenMoved) {
  const ctx = tex.getContext();
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, 600, 360);

  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('IMAGE PROJECTION DATA', 20, 28);
  ctx.fillStyle = '#333';
  ctx.fillRect(20, 38, 560, 1);

  // ── 7 data rows (SCENE_UNIT_TO_CM already applied by caller) ─────
  const rows = [
    { label: 'Object distance (u):', value: `${u_cm} cm`,        color: '#ffdd00' },
    { label: 'Actual screen dist:',  value: `${v_actual_cm} cm`, color: sharpness > 0.9 ? '#00ff88' : '#ff8844' },
    { label: 'Calc image dist (v):', value: `${v_calc_cm} cm`,   color: '#ffdd00' },
    { label: 'Total D = u + v:',     value: `${d_actual_cm} cm`, color: '#00e5ff' },
    { label: 'Focus error:',         value: `${error_cm} cm`,    color: sharpness > 0.9 ? '#00ff88' : '#ff8844' },
    { label: 'Magnification -v/u:',  value: imageReal ? `${mTheory.toFixed(2)}x` : 'N/A', color: '#ffdd00' },
    { label: 'Focal length (f):',    value: `${f_cm} cm`,        color: '#00e5ff' },
  ];
  let y = 60;
  for (const r of rows) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.fillText(r.label, 20, y);
    ctx.fillStyle = r.color;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(r.value, 340, y);
    y += 27;
  }

  ctx.fillStyle = '#555';
  ctx.fillRect(20, y - 18, 560, 1);

  // Sharpness bar
  const barY = y + 4;
  ctx.fillStyle = '#333';
  ctx.fillRect(20, barY, 560, 24);
  const barColor = sharpness > 0.9 ? '#00ff88' : sharpness > 0.5 ? '#ffaa00' : '#ff4444';
  ctx.fillStyle = barColor;
  ctx.fillRect(20, barY, Math.round(560 * sharpness), 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Image Sharpness: ${Math.round(sharpness * 100)}%`, 300, barY + 16);
  ctx.textAlign = 'left';

  // 8-state status line
  const currentlyFocused = imageReal && sharpness > 0.95;
  ctx.font = 'bold 15px monospace';
  const statusY = barY + 46;
  let color, msg;
  if (!imageReal) {
    color = '#ff4444';
    msg   = `No real image: u must be > f (${f_cm} cm)`;
  } else if (complete && currentlyFocused) {
    color = '#00ff88';
    msg   = 'SHARP INVERTED IMAGE - TASK COMPLETE!';
  } else if (complete && !currentlyFocused) {
    color = '#ffaa00';
    msg   = 'Task complete, but current image is out of focus.';
  } else if (!lensMoved && !screenMoved) {
    color = '#aaaaaa';
    msg   = 'Grab the lens and the screen to begin.';
  } else if (lensMoved && !screenMoved) {
    color = '#aaaaaa';
    msg   = 'Lens moved. Now move the screen to find focus.';
  } else if (!lensMoved && screenMoved) {
    color = '#aaaaaa';
    msg   = 'Screen moved. Now move the lens, then refocus the screen.';
  } else if (sharpness > 0.7) {
    color = '#ffaa00';
    msg   = 'Almost in focus - fine-tune the screen position.';
  } else {
    color = '#aaaaaa';
    msg   = 'Adjust lens and screen to focus the F.';
  }
  ctx.fillStyle = color;
  ctx.fillText(msg, 20, statusY);

  tex.update();
}

function _showSuccess(scene, cx, eyeY, axisZ, meshes, u_cm, v_actual_cm, v_calc_cm, f_cm, mTheory) {
  const tex = new BABYLON.DynamicTexture('cl_success_tex',
    { width: 600, height: 160 }, scene, true);

  const mat = new BABYLON.StandardMaterial('cl_success_mat', scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;

  const sign = BABYLON.MeshBuilder.CreatePlane('cl_success_sign', {
    width: 2.4, height: 0.65,
  }, scene);
  sign.position.set(cx, eyeY + 1.3, axisZ);
  sign.material        = mat;
  sign.checkCollisions = false;
  meshes.push(sign);

  // Initial paint in the focused palette (task just latched, so image is sharp)
  _updateSuccessSign(tex, true, u_cm, v_actual_cm, v_calc_cm, f_cm, mTheory);

  return { sign, tex };
}

function _updateSuccessSign(tex, currentlyFocused, u_cm, v_actual_cm, v_calc_cm, f_cm, mTheory) {
  const ctx = tex.getContext();
  const bg      = currentlyFocused ? '#006600' : '#102510';
  const title   = currentlyFocused ? '#FFFFFF' : '#A8D8A8';
  const sub     = currentlyFocused ? '#aaffaa' : '#88AA88';
  const hint    = '#88AA88';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 600, 160);

  ctx.fillStyle = title;
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(currentlyFocused ? 'SHARP INVERTED IMAGE!' : 'TASK COMPLETE', 300, 34);

  ctx.fillStyle = sub;
  ctx.font = '15px monospace';
  ctx.fillText(`u = ${u_cm} cm    v_actual = ${v_actual_cm} cm    v_calc = ${v_calc_cm} cm`, 300, 64);
  ctx.fillText(`f = ${f_cm} cm    Magnification m = -v/u = ${mTheory.toFixed(2)}x`, 300, 88);

  if (currentlyFocused) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px monospace';
    ctx.fillText('1/f = 1/u + 1/v   VERIFIED', 300, 118);
    ctx.fillStyle = sub;
    ctx.font = '13px monospace';
    ctx.fillText('Image: Real & Inverted', 300, 140);
  } else {
    ctx.fillStyle = hint;
    ctx.font = 'bold 15px monospace';
    ctx.fillText('Current image: OUT OF FOCUS', 300, 118);
    ctx.font = '13px monospace';
    ctx.fillText('Move screen until v_actual ~ v_calc', 300, 140);
  }

  tex.update();
}


function _makeLabel(scene, text, x, y, z, meshes, suffix, parent) {
  const lines = text.split('\n');
  const tex   = new BABYLON.DynamicTexture(`cl_lbl_${suffix}`, { width: 256, height: 80 }, scene, true);
  const ctx   = tex.getContext();
  ctx.clearRect(0, 0, 256, 80);
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => ctx.fillText(line, 128, 26 + i * 24));
  tex.update();

  const mat = new BABYLON.StandardMaterial(`cl_lbl_mat_${suffix}`, scene);
  mat.emissiveTexture     = tex;
  mat.diffuseTexture      = tex;
  mat.disableLighting     = true;
  mat.backFaceCulling     = false;
  if (mat.diffuseTexture) mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;

  const plane = BABYLON.MeshBuilder.CreatePlane(`cl_lbl_plane_${suffix}`, {
    width: 0.65, height: 0.2,
  }, scene);
  if (parent) {
    // Attach to a moving root: interpret (x,y,z) as WORLD coords and convert
    // to local by subtracting parent's world position.
    plane.parent = parent;
    const p = parent.getAbsolutePosition ? parent.getAbsolutePosition() : parent.position;
    plane.position.set(x - p.x, y - p.y, z - p.z);
  } else {
    plane.position.set(x, y, z);
  }
  plane.billboardMode   = BABYLON.Mesh.BILLBOARDMODE_Y;
  plane.material        = mat;
  plane.checkCollisions = false;
  meshes.push(plane);
}

// Creates a billboarded label plane whose DynamicTexture stays exposed so
// callers can repaint it. Returns { tex, plane, mat }.
function _makeDynamicLabel(scene, x, y, z, meshes, suffix, parent,
                           texSize = { width: 256, height: 96 },
                           planeSize = { planeW: 0.65, planeH: 0.24 }) {
  const tex = new BABYLON.DynamicTexture(`cl_dlbl_${suffix}`,
    { width: texSize.width, height: texSize.height }, scene, true);
  const mat = new BABYLON.StandardMaterial(`cl_dlbl_mat_${suffix}`, scene);
  mat.emissiveTexture = tex;
  mat.diffuseTexture  = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  if (mat.diffuseTexture) mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;

  const plane = BABYLON.MeshBuilder.CreatePlane(`cl_dlbl_plane_${suffix}`, {
    width: planeSize.planeW, height: planeSize.planeH,
  }, scene);
  if (parent) {
    plane.parent = parent;
    const p = parent.getAbsolutePosition ? parent.getAbsolutePosition() : parent.position;
    plane.position.set(x - p.x, y - p.y, z - p.z);
  } else {
    plane.position.set(x, y, z);
  }
  plane.billboardMode   = BABYLON.Mesh.BILLBOARDMODE_Y;
  plane.material        = mat;
  plane.checkCollisions = false;
  meshes.push(plane);
  return { tex, plane, mat };
}