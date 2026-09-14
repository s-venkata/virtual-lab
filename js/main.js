// js/main.js — Entry point (v13 — room-based rendering)
//
// Changes from v12:
//  1. Import createRoomManager
//  2. buildRoom/buildCorridor/buildDatacenter/buildOutdoor now return { floor, meshes }
//  3. All 4 rooms registered with roomManager
//  4. rm.start() fires the per-frame zone check
//  5. rm.onTeleport() hooked into XR teleport event for instant room swap
//  6. setupVR receives flat floor array extracted from destructured results
//  7. freezeWorldMatrix applied to floors only (roomManager roots handle the rest)

import { createScene }               from './scene.js';
import { createCamera }              from './camera.js';
import { createLighting }            from './lighting.js';
import { createMaterials }           from './materials.js';
import { buildRoom }                 from './room.js';
import { buildEquipment }            from './equipment.js';
import { createLightSwitch }         from './lightswitch.js';
import { loadModel }                 from './models.js';
import { createMenu, attachMenuToController } from './menu.js';
import { createDemoObjects }         from './demo-objects.js';
import { makeImportedModelPickable } from './pickup.js';
import { BUILDING, SPAWN }           from './building.js';
import { Door, enableVRDoorPushPull } from './doors/door.js';
import { buildCorridor }             from './rooms/corridor.js';
import { buildDatacenter }           from './rooms/datacenter.js';
import { buildOutdoor }              from './rooms/outdoor.js';
import { buildAiLab }                from './rooms/aiLab.js';
import { createRoomManager }         from './roomManager.js';
import { buildSternGerlachExperiment } from './experiments/experiment_sterngerlach.js';
import {
  setupEnvironment,
  setupGodRays,
  setupDust,
  setupScreenFlicker,
  setupVR,
} from './effects.js';
import {
  initNetwork, setNetworkCamera, getRoom,
  requestGrab, sendTransform, releaseObject,
  getMySessionId, onObjectChange,
  onGrabAccepted, onGrabRejected,
  createAiNetworkAdapter,
} from './network.js';
import { spawnAvatar, removeAvatar, updateAvatarTarget, startAvatarLerp } from './avatar.js';
import { initVoice, toggleMute, isMutedState, isVoiceStarted }           from './voice.js';
import { createExperimentRuntime } from './llm/runtime.js';
import { createGeneratorPanel }    from './llm/generatorPanel.js';

const loadBar     = document.getElementById('load-bar');
const loadLabel   = document.getElementById('load-label');
const setProgress = (pct, text) => {
  loadBar.style.width = pct + '%';
  if (text) loadLabel.textContent = text;
};

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('renderCanvas');

  const engine = new BABYLON.Engine(canvas, false, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: false,
    useHighPrecisionFloats: true,
  });

  setProgress(5,  'Creating scene…');
  const scene = createScene(engine);
  scene.skipPointerMovePicking = true;

  setProgress(12, 'Setting up camera…');
  const camera = createCamera(scene, canvas);
  camera.position.set(...SPAWN.position);
  camera.setTarget(new BABYLON.Vector3(...SPAWN.target));

  setProgress(20, 'Building lights…');
  const { sun, shadow, hemi, points } = createLighting(scene);

  setProgress(28, 'Loading environment…');
  setupEnvironment(scene);

  setProgress(36, 'Creating materials…');
  const M = createMaterials(scene);

  window.scene = scene;
  window.M = M;

  // ── Build all rooms ───────────────────────────────────────────────
  // Each buildX() returns { floor, meshes }
  setProgress(46, 'Building rooms…');
  const { floor: labFloor,        meshes: labMeshes        } = buildRoom(scene, M, shadow);
  const { floor: corridorFloor,   meshes: corridorMeshes   } = buildCorridor(scene, M, shadow);
  const { floor: datacenterFloor, meshes: datacenterMeshes } = buildDatacenter(scene, M, shadow);
  const { floor: aiLabFloor,      meshes: aiLabMeshes, lights: aiLabLights = [] } = buildAiLab(scene, M, shadow);
  const { floor: outdoorFloor,    meshes: outdoorMeshes    } = buildOutdoor(scene, M, shadow);

  // createDemoObjects(scene, M, shadow); // removed: lab room emptied

  setProgress(56, 'Adding equipment…');
  buildEquipment(scene, M, shadow);

  // ── Networked pickable helper ─────────────────────────────────────
  function makeNetworkedPickable(scene, result, objectId, options = {}) {
    let dragPending = false, isGrabbed = false, _netSetup = false;
    let _lastNetSend = 0;
    let _savedPos = null, _savedRot = null;

    function _setupListeners() {
      if (_netSetup) return;
      const room = getRoom();
      if (!room) return;
      if (!room.state) return;
      if (!room.state.objects) return;

      const accepted = onGrabAccepted(({ objectId: oid }) => {
        if (oid !== objectId) return;
        dragPending = false;
      });
      const rejected = onGrabRejected(({ objectId: oid }) => {
        if (oid !== objectId) return;
        dragPending = false;
        isGrabbed   = false;
        if (_savedPos) target.position.copyFrom(_savedPos);
        if (_savedRot) target.rotation.copyFrom(_savedRot);
      });
      const changed = onObjectChange(objectId, (state) => {
        if (state.ownerId === getMySessionId()) return;
        target.position.set(state.x, state.y, state.z);
        target.rotation.set(state.rotX, state.rotY, state.rotZ);
      });
      if (accepted && rejected && changed) _netSetup = true;
    }

    const target = makeImportedModelPickable(scene, result, {
      ...options,
      onPickup: () => {
        _savedPos = target.position.clone();
        _savedRot = target.rotation.clone();
        _setupListeners();
        const ok = requestGrab(objectId);
        if (!ok) {
          console.warn(`[main] multiplayer not connected for ${objectId}`);
          return;
        }
        dragPending = true;
        isGrabbed   = true;
      },
      onDrop: () => {
        if (isGrabbed) {
          if (!dragPending) sendTransform(objectId, target.position, target.rotation, 0);
          releaseObject(objectId);
        }
        dragPending = false;
        isGrabbed   = false;
      },
    });

    if (!target) {
      console.warn(`[main] networked model target missing for ${objectId}`);
      return null;
    }

    scene.registerBeforeRender(() => {
      _setupListeners();
      const now = performance.now();
      if (isGrabbed && !dragPending && now - _lastNetSend > 50) {
        sendTransform(objectId, target.position, target.rotation, 0);
        _lastNetSend = now;
      }
    });

    return target;
  }

  // ── Load models in parallel ───────────────────────────────────────
  // Removed: fire extinguisher, Baumer, cable, motor, scope, labtable1 clones
  // and all makeNetworkedPickable(...) wiring. Main lab now hosts the
  // Stern-Gerlach experiment only.
  setProgress(64, 'Building Stern-Gerlach experiment…');
  const sg = buildSternGerlachExperiment(scene, shadow, 'lab');
  const labExtraMeshes = [...sg.meshes];

  // ── Freeze floor transforms ───────────────────────────────────────
  [labFloor, corridorFloor, datacenterFloor, aiLabFloor, outdoorFloor].forEach(m => {
    if (m) m.freezeWorldMatrix();
  });

  // ── Room manager ──────────────────────────────────────────────────
  setProgress(78, 'Setting up room manager…');
  const rm = createRoomManager(scene, camera);

  rm.registerRoom('lab',        [...labMeshes, ...labExtraMeshes], labFloor);
  rm.registerRoom('corridor',   corridorMeshes,                    corridorFloor);
  rm.registerRoom('datacenter', datacenterMeshes,                  datacenterFloor);
  rm.registerRoom('aiLab',      aiLabMeshes,                       aiLabFloor);
  rm.registerRoom('outdoor',    outdoorMeshes,                     outdoorFloor);

  rm.start();
  window.roomManager = rm; // expose for console debugging

  // ── Effects ───────────────────────────────────────────────────────
  setProgress(82, 'Atmosphere…');
  const godRays = setupGodRays(scene);
  setupDust(scene);
  setupScreenFlicker(scene, M.screen);

  setProgress(88, 'Installing light switch…');
  const lightSwitch = createLightSwitch(scene, { hemi, sun, points, godRays, materials: M, extraLights: aiLabLights });
  window.lightSwitch = lightSwitch;

  // ── Doors ─────────────────────────────────────────────────────────
  setProgress(92, 'Hanging doors…');
  const labDoor = new Door(scene, M, shadow, {
    name: 'lab_door',
    position: BUILDING.lab.doorPosition,
    width:    BUILDING.lab.doorWidth,
    height:   BUILDING.lab.doorHeight,
    rotation: BUILDING.lab.doorRotation,
    hingeSide: 'left',
  });
  const dcDoor = new Door(scene, M, shadow, {
    name: 'dc_door',
    position: BUILDING.datacenter.doorPosition,
    width:    BUILDING.datacenter.doorWidth,
    height:   BUILDING.datacenter.doorHeight,
    rotation: BUILDING.datacenter.doorRotation,
    hingeSide: 'left',
  });
  const aiLabDoor = new Door(scene, M, shadow, {
    name: 'aiLab_door',
    position: BUILDING.aiLab.doorPosition,
    width:    BUILDING.aiLab.doorWidth,
    height:   BUILDING.aiLab.doorHeight,
    rotation: BUILDING.aiLab.doorRotation,
    hingeSide: 'left',
  });
  const outdoorDoor = new Door(scene, M, shadow, {
    name: 'outdoor_door',
    position: BUILDING.outdoor.doorPosition,
    width:    BUILDING.outdoor.doorWidth,
    height:   BUILDING.outdoor.doorHeight,
    rotation: BUILDING.outdoor.doorRotation,
    hingeSide: 'left',
  });
  const allDoors = [labDoor, dcDoor, aiLabDoor, outdoorDoor];

  // ── VR ────────────────────────────────────────────────────────────
  setProgress(94, 'Setting up VR…');
  await setupVR(scene, [labFloor, corridorFloor, datacenterFloor, aiLabFloor, outdoorFloor]);

  // ── Multiplayer ───────────────────────────────────────────────────
  setProgress(95, 'Connecting multiplayer…');
  startAvatarLerp(scene);
  await initNetwork(scene, {
    onJoin:  (sid, ps) => spawnAvatar(scene, sid, ps),
    onLeave: (sid)     => removeAvatar(sid),
    onMove:  (sid, ps) => updateAvatarTarget(sid, ps),
  });
  setNetworkCamera(() => camera);  // desktop camera until VR is entered
  window.voice = { start: () => initVoice(getRoom()), toggleMute, isMutedState };

  // ── Voice chat button ─────────────────────────────────────────
  if (!document.getElementById('voice-btn')) {
    const voiceBtn = document.createElement('button');
    voiceBtn.id = 'voice-btn';
    voiceBtn.textContent = '🎤 Join Voice';
    document.body.appendChild(voiceBtn);

    let _voiceStarted = false;

    async function _onVoiceBtnClick() {
      if (!_voiceStarted) {
        voiceBtn.disabled = true;
        voiceBtn.textContent = '🎤 Connecting…';

        let ok = false;
        try {
          ok = await window.voice.start();
        } catch (e) {
          console.warn('[voice-btn] start failed:', e);
          ok = false;
        }

        voiceBtn.disabled = false;

        if (ok === false) {
          voiceBtn.textContent = '❌ Mic Denied';
          voiceBtn.classList.add('voice-denied');
          voiceBtn.disabled = true;
          return;
        }

        _voiceStarted = true;
        voiceBtn.textContent = '🎤 Mic On';
        voiceBtn.classList.add('voice-active');
        return;
      }

      const muted = window.voice.toggleMute();
      if (muted) {
        voiceBtn.textContent = '🔇 Muted';
        voiceBtn.classList.remove('voice-active');
        voiceBtn.classList.add('voice-muted');
      } else {
        voiceBtn.textContent = '🎤 Mic On';
        voiceBtn.classList.remove('voice-muted');
        voiceBtn.classList.add('voice-active');
      }
    }

    voiceBtn.addEventListener('click', _onVoiceBtnClick);
  }

  const _doorRoom = getRoom();
  if (_doorRoom) {
    _doorRoom.onMessage("door_sync", (states) => {
      Object.entries(states).forEach(([doorId, isOpen]) => {
        const d = allDoors.find(door => door.name === doorId);
        if (d) d.toggle(true, isOpen);
      });
    });
    _doorRoom.onMessage("door_set", ({ doorId, isOpen }) => {
      if (typeof doorId !== "string") return;
      if (typeof isOpen !== "boolean") return;
      const d = allDoors.find(door => door.name === doorId);
      if (d) d.toggle(true, isOpen);
    });
    _doorRoom.send("door_request_sync", {});
  }

  const _lightRoom = getRoom();
  if (_lightRoom) {
    _lightRoom.onMessage("light_set", ({ state }) => {
      if (typeof state === "boolean") lightSwitch?.setLight(state);
    });
    _lightRoom.onMessage("light_sync", ({ state }) => {
      if (typeof state === "boolean") lightSwitch?.setLight(state);
    });
    _lightRoom.send("light_request_sync", {});
  }

  const patchXR = (xrExp) => {
    // Disable desktop gravity + god rays inside headset
    // Teleport hook is handled inside effects.js setupVR
    xrExp.baseExperience.onStateChangedObservable.add(state => {
      const inXR = state === BABYLON.WebXRState.IN_XR;
      camera.applyGravity    = !inXR;
      if (godRays) godRays.isEnabled = !inXR;
      // Switch network position source when entering / leaving VR
      if (inXR) {
        setNetworkCamera(() => xrExp.baseExperience.camera);
      } else {
        setNetworkCamera(() => camera);
      }
    });
  };

  // ── X button → voice mute (left Quest controller) ─────────────────────────
  let _voiceXWired = false;
  const _wiredControllers = new WeakSet();

  function wireVoiceMuteButton(xrExp) {
    if (_voiceXWired) return;
    _voiceXWired = true;

    const _wiredButtons = new WeakSet();

    const wireMotionController = (motionController) => {
      if (!motionController || _wiredButtons.has(motionController)) return;
      _wiredButtons.add(motionController);

      const xButton = motionController.getComponent('x-button');
      if (!xButton) {
        console.warn('[voice] x-button not found. Components:', motionController.getComponentIds?.());
        return;
      }

      xButton.onButtonStateChangedObservable.add((component) => {
        if (!component.pressed) return;
        if (!isVoiceStarted()) {
          console.warn('[voice] start voice first (🎤 Join Voice button)');
          return;
        }

        const muted = toggleMute();
        console.log('[voice] muted:', muted);

        const btn = document.getElementById('voice-btn');
        if (btn) {
          btn.textContent = muted ? '🔇 Muted' : '🎤 Mic On';
          btn.classList.toggle('voice-muted',  muted);
          btn.classList.toggle('voice-active', !muted);
        }
      });
    };

    const wireController = (controller) => {
      if (!controller || _wiredControllers.has(controller)) return;
      if (controller.inputSource.handedness !== 'left') return;
      _wiredControllers.add(controller);

      if (controller.motionController) wireMotionController(controller.motionController);
      controller.onMotionControllerInitObservable.add(wireMotionController);
    };

    xrExp.input.controllers.forEach(wireController);
    xrExp.input.onControllerAddedObservable.add(wireController);
  }

  const wireDoors = () => {
    if (window.xrExperience && window.xrExperience.input) {
      enableVRDoorPushPull(allDoors, window.xrExperience);
      patchXR(window.xrExperience);
      wireVoiceMuteButton(window.xrExperience);
      console.log('[v13] VR wired: doors + camera + room manager');
    } else {
      setTimeout(wireDoors, 500);
    }
  };
  wireDoors();

  // ── AI Lab Generator (LLM runtime + VR panel) ────────────────────
  setProgress(96, 'Setting up AI generator…');
  const aiNetwork = createAiNetworkAdapter(getRoom);
  const aiRuntime = createExperimentRuntime({
    scene, shadow, M,
    roomManager: rm,
    network: aiNetwork,
  });
  aiRuntime.attachToNetwork();
  window.aiRuntime = aiRuntime;
  // Console helpers for testing without an OpenAI key:
  //   aiDemo('pendulum') | aiDemo('freefall') | aiDemo('spring')
  window.aiDemo = (n) => aiRuntime.spawnDemo(n || 'pendulum');
  const aiPanel = createGeneratorPanel(scene, aiRuntime);
  window.aiPanel = aiPanel;

  // ── Menu ──────────────────────────────────────────────────────────
  setProgress(97, 'Setting up menu…');
  const menu = createMenu(scene, {
    onAiGen:       () => aiPanel.toggle(),
    onReset:       () => console.log('Reset triggered'),
    onToggleLights: () => { if (window.lightSwitch?.flip) window.lightSwitch.flip(); },
    onExit:        () => { if (window.xrExperience) window.xrExperience.baseExperience.exitXRAsync(); },
  });
  window.menu = menu;

  setProgress(100, 'Ready!');

  scene.executeWhenReady(() => {
    const loading = document.getElementById('loading');
    loading.style.opacity = '0';
    setTimeout(() => (loading.style.display = 'none'), 700);
    document.getElementById('hud').style.display = 'block';
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
});