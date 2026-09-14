// js/menu.js
// Wrist-mounted VR menu using Babylon GUI for proper VR interaction.

const MENU_OPTIONS = [
  { id: 'aigen',  label: 'AI Lab Generator', color: '#00d9f0' },
  { id: 'reset',  label: 'Reset Experiment', color: '#00e5ff' },
  { id: 'lights', label: 'Toggle Lights',    color: '#ffcc44' },
  { id: 'help',   label: 'Help',             color: '#88ff88' },
  { id: 'exit',   label: 'Exit VR',          color: '#ff5566' },
];

const HELP_TEXT = `CONTROLS

Desktop:
  WASD - walk
  Mouse - look around
  M - toggle menu

VR (Quest):
  Thumbstick - walk
  Trigger - select
  Left controller menu button - this menu

WDM Experiment:
  Walk to bench, click START
  Watch lasers fire`;

export function createMenu(scene, callbacks = {}) {
  // ── Create plane that will hold the GUI ─────────────────────────────────────
  const plane = BABYLON.MeshBuilder.CreatePlane('vrMenu', { width: 0.4, height: 0.4 }, scene);
  plane.setEnabled(false);
  plane.isPickable = true;
  plane.renderingGroupId = 1;  // render above other meshes

  // ── Babylon GUI texture on the plane (auto-handles VR pointer + clicks) ────
  const adt = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1024, 1024);

  let mode = 'menu';

  // Background panel
  const bg = new BABYLON.GUI.Rectangle();
  bg.width = '100%';
  bg.height = '100%';
  bg.background = '#080c14ee';
  bg.color = '#00e5ff';
  bg.thickness = 4;
  bg.cornerRadius = 20;
  adt.addControl(bg);

  // Title bar
  const titleBg = new BABYLON.GUI.Rectangle();
  titleBg.height = '120px';
  titleBg.width = '100%';
  titleBg.background = '#00e5ff';
  titleBg.thickness = 0;
  titleBg.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  titleBg.cornerRadius = 20;
  bg.addControl(titleBg);

  const title = new BABYLON.GUI.TextBlock();
  title.text = 'VR OPTICS LAB MENU';
  title.color = '#000';
  title.fontSize = 56;
  title.fontFamily = 'monospace';
  title.fontWeight = 'bold';
  titleBg.addControl(title);

  // Container for menu/help content
  const content = new BABYLON.GUI.StackPanel();
  content.width = '90%';
  content.top = '40px';
  content.spacing = 25;
  content.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  bg.addControl(content);

  // ── Build menu buttons ──────────────────────────────────────────────────────
  function buildMenu() {
    content.clearControls();
    title.text = 'VR LAB MENU';

    MENU_OPTIONS.forEach(opt => {
      const btn = BABYLON.GUI.Button.CreateSimpleButton(`btn_${opt.id}`, opt.label);
      btn.width = '95%';
      btn.height = '120px';
      btn.color = opt.color;
      btn.fontSize = 48;
      btn.fontFamily = 'monospace';
      btn.fontWeight = 'bold';
      btn.background = '#00e5ff20';
      btn.thickness = 4;
      btn.cornerRadius = 12;

      btn.onPointerEnterObservable.add(() => {
        btn.background = opt.color;
        if (btn.textBlock) btn.textBlock.color = '#000';
      });
      btn.onPointerOutObservable.add(() => {
        btn.background = '#00e5ff20';
        if (btn.textBlock) btn.textBlock.color = opt.color;
      });
      btn.onPointerClickObservable.add(() => {
        handleAction(opt.id);
      });

      content.addControl(btn);
    });
  }

  // ── Build help screen ───────────────────────────────────────────────────────
  function buildHelp() {
    content.clearControls();
    title.text = 'HELP';

    const helpText = new BABYLON.GUI.TextBlock();
    helpText.text = HELP_TEXT;
    helpText.color = '#bbccdd';
    helpText.fontSize = 32;
    helpText.fontFamily = 'monospace';
    helpText.height = '700px';
    helpText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    helpText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    content.addControl(helpText);

    const back = BABYLON.GUI.Button.CreateSimpleButton('back', 'BACK');
    back.width = '60%';
    back.height = '100px';
    back.color = '#ffaa00';
    back.fontSize = 40;
    back.fontFamily = 'monospace';
    back.fontWeight = 'bold';
    back.background = '#00e5ff20';
    back.thickness = 4;
    back.cornerRadius = 12;
    back.onPointerClickObservable.add(() => {
      mode = 'menu';
      buildMenu();
    });
    content.addControl(back);
  }

  function handleAction(id) {
    switch (id) {
      case 'aigen':
        if (callbacks.onAiGen) callbacks.onAiGen();
        flash('Opening AI Generator…', '#00d9f0');
        setTimeout(close, 400);
        break;
      case 'reset':
        if (callbacks.onReset) callbacks.onReset();
        flash('Experiment reset', '#00e5ff');
        break;
      case 'lights':
        if (callbacks.onToggleLights) callbacks.onToggleLights();
        flash('Lights toggled', '#ffcc44');
        break;
      case 'help':
        mode = 'help';
        buildHelp();
        break;
      case 'exit':
        if (callbacks.onExit) callbacks.onExit();
        flash('Exiting VR…', '#ff5566');
        setTimeout(close, 600);
        break;
    }
  }

  function flash(text, color) {
    const flashBox = new BABYLON.GUI.Rectangle();
    flashBox.width = '80%';
    flashBox.height = '120px';
    flashBox.background = '#000a';
    flashBox.color = color;
    flashBox.thickness = 4;
    flashBox.cornerRadius = 12;
    flashBox.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;

    const flashText = new BABYLON.GUI.TextBlock();
    flashText.text = text;
    flashText.color = color;
    flashText.fontSize = 48;
    flashText.fontFamily = 'monospace';
    flashText.fontWeight = 'bold';
    flashBox.addControl(flashText);
    bg.addControl(flashBox);

    setTimeout(() => bg.removeControl(flashBox), 1200);
  }

  buildMenu();

  // ── Anchor + face-camera logic ──────────────────────────────────────────────
  let attachTo = scene.activeCamera;
  let attachOffset = new BABYLON.Vector3(0, 0, 1.0);
  let isOpen = false;

  scene.registerBeforeRender(() => {
    if (!isOpen || !attachTo) return;

    const matrix = attachTo.getWorldMatrix
      ? attachTo.getWorldMatrix()
      : (attachTo.computeWorldMatrix && attachTo.computeWorldMatrix(true));

    if (matrix) {
      const worldPos = BABYLON.Vector3.TransformCoordinates(attachOffset, matrix);
      plane.position.copyFrom(worldPos);
    }

    // Face the active camera (so text reads correctly)
    const cam = scene.activeCamera;
    if (cam) {
      const camPos = cam.globalPosition || cam.position;
      // Make the plane look at the camera — text now faces user
      const lookDir = camPos.subtract(plane.position).normalize();
      const yaw = Math.atan2(lookDir.x, lookDir.z);
      plane.rotation.y = yaw + Math.PI;  
      plane.rotation.x = 0;
      plane.rotation.z = 0;
    }
  });

  function open() {
    plane.setEnabled(true);
    isOpen = true;
    mode = 'menu';
    buildMenu();
  }
  function close() {
    plane.setEnabled(false);
    isOpen = false;
  }
  function toggle() { isOpen ? close() : open(); }

  // M key for desktop
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      toggle();
    }
  });

  return {
    open, close, toggle,
    setAnchor: (node, offset) => {
      attachTo = node;
      if (offset) attachOffset = new BABYLON.Vector3(...offset);
    },
    plane,
  };
}

// ── Attach to VR controller ─────────────────────────────────────────────────
export function attachMenuToController(menu, xrHelper) {
  if (!xrHelper) return;
  const bound = new Set();

  function bindController(controller) {
    if (bound.has(controller)) return;
    bound.add(controller);

    const setup = (mc) => {
      const hand = controller.inputSource.handedness;

      if (hand === 'left') {
        // Position menu in front of the user (1m forward), not on wrist
        // (wrist looks cool but is hard to read — front-of-face is more usable)
        menu.setAnchor(controller.pointer, [0.0, 0.15, 0.4]);
        console.log('🎮 Menu anchored to left controller');
      }

      // Bind menu button on left controller (Quest's dedicated menu button)
     if (hand === 'left') {
    //  const buttonsToBind = ['menu', 'x-button', 'y-button', 'xr-standard-squeeze'];
    const buttonsToBind = ['y-button'];
     buttonsToBind.forEach(name => {
       const btn = mc.getComponent(name);
       if (btn) {
         console.log(`🎮 Bound ${name} on left`);
         let wasPressed = false;
         btn.onButtonStateChangedObservable.add(() => {
           if (btn.pressed && !wasPressed) {
             console.log(`🎮 ${name} pressed → toggle menu`);
             menu.toggle();
           }
           wasPressed = btn.pressed;
         });
       }
     });
   }

  
    };

    if (controller.motionController) setup(controller.motionController);
    else controller.onMotionControllerInitObservable.add(setup);
  }

  xrHelper.input.onControllerAddedObservable.add(bindController);
  if (xrHelper.input.controllers) xrHelper.input.controllers.forEach(bindController);
}