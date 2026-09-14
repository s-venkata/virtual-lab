// js/llm/generatorPanel.js
// In-VR panel for the AI Lab Generator.
//
// v2 UX:
//   - Preset prompt buttons (grid) for zero-typing generation in VR.
//   - Larger panel (0.8×0.6 m) for readability in headset.
//   - Mic button visually reflects recording state (red pulse) with label.
//   - `capture.release()` after each transcription so the mic indicator
//     turns off between recordings.
//   - Reset on close (transcript, status, stop in-progress recording).
//   - Permission pre-check via navigator.permissions.
//   - renderingGroupId = 2 (above the wrist menu at 1).
//
// Desktop fallback: HTML overlay via window.aiPrompt or window.aiGen.setPrompt.

import { createVoiceCapture } from './voiceCapture.js';
import { transcribeBlob }     from './client.js';

// ── Preset prompts — the LLM few-shots cover pendulum/freefall/lens, and
// these strings match those examples closely so output is predictable.
const PRESETS = [
  { label: 'Pendulum',    prompt: 'A simple pendulum with a 1.2 m string on a 2.2 m stand, initial angle 0.5 rad, showing period readout.' },
  { label: 'Free Fall',   prompt: 'Galileo free-fall drop: a ball on top of a 3 m tower, ground at y=0, show fall time.' },
  { label: 'Spring-Mass', prompt: 'A spring-mass oscillator hanging from a 2.5 m stand, k=25 N/m, mass 0.4 kg, starting stretch 0.15 m.' },
  { label: 'Thin Lens',   prompt: 'A convex thin-lens bench: lamp, slide with letter F, draggable convex lens (focal 0.5 m) on axis-x between slide and screen.' },
  { label: 'Snell',       prompt: 'Snell refraction demo: laser hitting a glass prism (n=1.5) at 30°, show refraction angle in the readout.' },
  { label: 'Malus Law',   prompt: "Malus's law: laser through a polarizer at 30° into a photodetector, show transmittance as the polarizer rotates." },
  { label: 'Ramp Cart',   prompt: 'A ramp with a cart rolling down under gravity — 30° incline, 2 m length, mass 1 kg.' },
  { label: 'Info Only',   prompt: 'A stationary display: label "Kirchhoff\'s Laws" and an infoboard listing the two laws. No physics.' },
];

export function createGeneratorPanel(scene, runtime, opts = {}) {
  // Larger panel for VR readability
  const plane = BABYLON.MeshBuilder.CreatePlane('aiGenPanel',
    { width: 0.8, height: 0.6 }, scene);
  plane.setEnabled(false);
  plane.isPickable = true;
  plane.renderingGroupId = 2;    // above wrist menu (1)

  const adt = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1280, 960);

  const bg = new BABYLON.GUI.Rectangle();
  bg.width = '100%'; bg.height = '100%';
  bg.background = '#06121cee';
  bg.color = '#00d9f0';
  bg.thickness = 4;
  bg.cornerRadius = 18;
  adt.addControl(bg);

  // Title bar
  const titleBg = new BABYLON.GUI.Rectangle();
  titleBg.height = '110px'; titleBg.width = '100%';
  titleBg.background = '#00d9f0';
  titleBg.thickness = 0;
  titleBg.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  titleBg.cornerRadius = 18;
  bg.addControl(titleBg);

  const title = new BABYLON.GUI.TextBlock();
  title.text = 'AI LAB GENERATOR';
  title.color = '#000';
  title.fontSize = 48;
  title.fontFamily = 'monospace';
  title.fontWeight = 'bold';
  titleBg.addControl(title);

  // ── Preset grid (2 rows × 4 cols) ────────────────────────────────
  const presetGrid = new BABYLON.GUI.Grid();
  presetGrid.width = '95%';
  presetGrid.height = '260px';
  presetGrid.top = '125px';
  presetGrid.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  for (let r = 0; r < 2; r++) presetGrid.addRowDefinition(0.5);
  for (let c = 0; c < 4; c++) presetGrid.addColumnDefinition(0.25);
  bg.addControl(presetGrid);

  // Transcript area
  const transcript = new BABYLON.GUI.TextBlock();
  transcript.text = '(pick a preset or record a prompt)';
  transcript.color = '#aaccff';
  transcript.fontSize = 26;
  transcript.fontFamily = 'monospace';
  transcript.textWrapping = BABYLON.GUI.TextWrapping.WordWrap;
  transcript.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  transcript.textVerticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  transcript.paddingLeft = '24px';
  transcript.paddingRight = '24px';
  transcript.height = '240px';
  transcript.top = '400px';
  transcript.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  bg.addControl(transcript);

  // Status line
  const status = new BABYLON.GUI.TextBlock();
  status.text = 'idle';
  status.color = '#888888';
  status.fontSize = 24;
  status.fontFamily = 'monospace';
  status.height = '40px';
  status.top = '650px';
  status.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  bg.addControl(status);

  function setStatus(text, color = '#aaaaaa') {
    status.text = text;
    status.color = color;
  }

  // ── Preset buttons ──────────────────────────────────────────────
  function makePresetBtn(preset) {
    const b = BABYLON.GUI.Button.CreateSimpleButton(`preset_${preset.label}`, preset.label);
    b.width = '95%';
    b.height = '95%';
    b.color = '#00d9f0';
    b.fontSize = 26;
    b.fontFamily = 'monospace';
    b.fontWeight = 'bold';
    b.background = '#00d9f018';
    b.thickness = 3;
    b.cornerRadius = 10;
    b.onPointerEnterObservable.add(() => {
      b.background = '#00d9f0';
      if (b.textBlock) b.textBlock.color = '#000';
    });
    b.onPointerOutObservable.add(() => {
      b.background = '#00d9f018';
      if (b.textBlock) b.textBlock.color = '#00d9f0';
    });
    b.onPointerClickObservable.add(() => {
      _currentPromptText = preset.prompt;
      transcript.text = `[${preset.label}] ${preset.prompt}`;
      setStatus('preset loaded — press GENERATE', '#88ff88');
    });
    return b;
  }
  PRESETS.forEach((preset, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    presetGrid.addControl(makePresetBtn(preset), row, col);
  });

  // ── Action buttons row ──────────────────────────────────────────
  const row = new BABYLON.GUI.StackPanel();
  row.isVertical = false;
  row.height = '140px';
  row.width = '95%';
  row.spacing = 18;
  row.top = '710px';
  row.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  bg.addControl(row);

  function makeBtn(label, color) {
    const b = BABYLON.GUI.Button.CreateSimpleButton('btn_' + label.replace(/\s/g, '_'), label);
    b.width = '380px';
    b.height = '130px';
    b.color = color;
    b.fontSize = 40;
    b.fontFamily = 'monospace';
    b.fontWeight = 'bold';
    b.background = '#00d9f020';
    b.thickness = 4;
    b.cornerRadius = 12;
    b._defaultBg = '#00d9f020';
    b._defaultColor = color;
    b.onPointerEnterObservable.add(() => {
      if (b._suppressHover) return;
      b.background = color;
      if (b.textBlock) b.textBlock.color = '#000';
    });
    b.onPointerOutObservable.add(() => {
      if (b._suppressHover) return;
      b.background = b._defaultBg;
      if (b.textBlock) b.textBlock.color = b._defaultColor;
    });
    return b;
  }

  const micBtn = makeBtn('🎙 RECORD', '#00d9f0');
  const genBtn = makeBtn('GENERATE', '#88ff88');
  row.addControl(micBtn);
  row.addControl(genBtn);

  // Close button (top-right)
  const closeBtn = BABYLON.GUI.Button.CreateSimpleButton('btn_close', '✕');
  closeBtn.width = '80px';
  closeBtn.height = '80px';
  closeBtn.color = '#000';
  closeBtn.fontSize = 40;
  closeBtn.fontWeight = 'bold';
  closeBtn.background = '#00d9f0';
  closeBtn.thickness = 0;
  closeBtn.cornerRadius = 12;
  closeBtn.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  closeBtn.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  closeBtn.top = '15px'; closeBtn.left = '-15px';
  closeBtn.onPointerClickObservable.add(() => close());
  bg.addControl(closeBtn);

  // ── Recording pulse animation ───────────────────────────────────
  let _pulseObs = null;
  function startPulse() {
    let t = 0;
    micBtn._suppressHover = true;
    micBtn.textBlock.text = '⏹ STOP';
    _pulseObs = scene.onBeforeRenderObservable.add(() => {
      t += scene.getEngine().getDeltaTime() / 1000;
      const a = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 4));
      micBtn.background = `rgba(255, 68, 68, ${a.toFixed(3)})`;
      if (micBtn.textBlock) micBtn.textBlock.color = '#ffffff';
    });
  }
  function stopPulse() {
    if (_pulseObs) {
      scene.onBeforeRenderObservable.remove(_pulseObs);
      _pulseObs = null;
    }
    micBtn._suppressHover = false;
    micBtn.textBlock.text = '🎙 RECORD';
    micBtn.background = micBtn._defaultBg;
    if (micBtn.textBlock) micBtn.textBlock.color = micBtn._defaultColor;
  }

  // ── Voice capture ───────────────────────────────────────────────
  let capture = createVoiceCapture();
  let _currentPromptText = '';

  async function _checkMicPermission() {
    try {
      if (!navigator.permissions?.query) return true;
      const p = await navigator.permissions.query({ name: 'microphone' });
      if (p.state === 'denied') {
        setStatus('mic permission denied — enable it in browser settings', '#ff4444');
        return false;
      }
      return true;
    } catch { return true; }
  }

  micBtn.onPointerClickObservable.add(async () => {
    if (capture.isRecording()) {
      try {
        setStatus('transcribing…', '#ffaa44');
        stopPulse();
        const blob = await capture.stop();
        capture.release();  // release mic — indicator turns off
        capture = createVoiceCapture();  // fresh capture for next round
        const r = await transcribeBlob(blob);
        if (!r.ok) {
          setStatus('transcribe error: ' + r.error, '#ff4444');
          return;
        }
        _currentPromptText = (r.text || '').trim();
        transcript.text = _currentPromptText || '(empty transcription)';
        setStatus('ready — press GENERATE', '#88ff88');
      } catch (e) {
        stopPulse();
        setStatus('mic stop error: ' + e.message, '#ff4444');
      }
      return;
    }

    if (!(await _checkMicPermission())) return;

    try {
      setStatus('recording… (tap mic to stop)', '#00d9f0');
      await capture.start();
      startPulse();
    } catch (e) {
      setStatus('mic permission denied: ' + e.message, '#ff4444');
    }
  });

  genBtn.onPointerClickObservable.add(async () => {
    const promptText = (_currentPromptText || window.aiPrompt || '').trim();
    if (!promptText) {
      setStatus('pick a preset or record a prompt first', '#ff4444');
      return;
    }
    setStatus('generating…', '#ffaa44');
    try {
      const r = await runtime.spawnFromPrompt(promptText);
      if (!r.ok) {
        const msg = (r.errors && r.errors.join('; ')) || r.error || 'unknown';
        setStatus('generate error: ' + msg, '#ff4444');
        return;
      }
      setStatus('spawned: ' + (r.spec?.title || r.id), '#88ff88');
    } catch (e) {
      setStatus('generate exception: ' + e.message, '#ff4444');
    }
  });

  // ── Snap-on-open positioning ────────────────────────────────────
  function _positionInFrontOfCamera() {
    const cam = scene.activeCamera;
    if (!cam) return;

    const camPos = cam.globalPosition || cam.position;

    let forward;
    if (typeof cam.getForwardRay === 'function') {
      forward = cam.getForwardRay(1).direction.clone();
    } else if (typeof cam.getDirection === 'function') {
      forward = cam.getDirection(BABYLON.Axis.Z).clone();
    } else {
      forward = new BABYLON.Vector3(0, 0, 1);
    }
    forward.y = 0;
    if (forward.lengthSquared() < 1e-6) forward = new BABYLON.Vector3(0, 0, 1);
    forward.normalize();

    // Slightly farther for the larger panel; still comfortable eye distance
    const target = camPos.add(forward.scale(1.15));
    target.y -= 0.15;
    plane.position.copyFrom(target);

    const lookDir = camPos.subtract(plane.position);
    plane.rotation.y = Math.atan2(lookDir.x, lookDir.z) + Math.PI;
    plane.rotation.x = 0;
    plane.rotation.z = 0;
  }

  let isOpen = false;

  function _resetState() {
    _currentPromptText = '';
    transcript.text = '(pick a preset or record a prompt)';
    setStatus('idle — pick a preset or press 🎙 RECORD', '#aaaaaa');
    if (capture.isRecording()) {
      try { capture.stop().catch(() => {}); } catch {}
    }
    try { capture.release(); } catch {}
    capture = createVoiceCapture();
    stopPulse();
  }

  function open() {
    _resetState();
    _positionInFrontOfCamera();
    plane.setEnabled(true);
    isOpen = true;
  }
  function close() {
    plane.setEnabled(false);
    isOpen = false;
    _resetState();
  }
  function toggle() { isOpen ? close() : open(); }

  // Desktop helper — typing into the URL bar / console
  window.aiGen = {
    setPrompt: (text) => { _currentPromptText = text; transcript.text = text; },
    open, close, toggle,
  };

  return {
    open, close, toggle, plane,
  };
}
