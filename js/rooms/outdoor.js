import { BUILDING } from '../building.js';

export function buildOutdoor(scene, M, shadow) {
  const O = BUILDING.outdoor;
  const [cx, cy, cz] = O.center;
  const [w, h, d] = O.size;
  const meshes = [];

  // ── Invisible floor — collision + VR teleport target ─────────────
  const floor = BABYLON.MeshBuilder.CreateGround(
    'splat_room_floor', { width: w, height: d }, scene
  );
  floor.position.set(cx, cy, cz);
  floor.checkCollisions = true;
  floor.isVisible       = false;
  meshes.push(floor);

  // ── Invisible boundary walls ──────────────────────────────────────
  const makeWall = (name, sx, sy, sz, px, py, pz) => {
    const wall = BABYLON.MeshBuilder.CreateBox(
      name, { width: sx, height: sy, depth: sz }, scene
    );
    wall.position.set(px, py, pz);
    wall.checkCollisions = false;
    wall.isVisible       = false;
    meshes.push(wall);
    return wall;
  };

  makeWall('splat_wall_s', w,   h, 0.2, cx,        cy + h/2, cz + d/2);
  makeWall('splat_wall_e', 0.2, h, d,   cx + w/2,  cy + h/2, cz);
  makeWall('splat_wall_w', 0.2, h, d,   cx - w/2,  cy + h/2, cz);
  // North wall intentionally absent — doorway from corridor

  // ── Splat (optional) — async load ─────────────────────────────────
  // A placeholder TransformNode is created immediately so roomManager can
  // parent it right away. The actual splat mesh is attached once loaded.
  const splatAnchor = new BABYLON.TransformNode('splat_anchor', scene);
  meshes.push(splatAnchor);

  const splatUrl = globalThis?.VR_LAB_SPLAT_URL;
  if (typeof splatUrl === 'string' && splatUrl.trim()) {
    (async () => {
      try {
        const result = await BABYLON.ImportMeshAsync(splatUrl, scene);
        const splat = result.meshes[0];

        splat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        splat.position  = new BABYLON.Vector3(cx - 1.45, cy + 0.25, cz - 7.5);
        splat.scaling   = new BABYLON.Vector3(1.25, 1.25, 1.25);
        splat.rotation  = new BABYLON.Vector3(Math.PI, Math.PI, 0);

        // Performance: freeze transform since splat never moves
        splat.freezeWorldMatrix();
        splat.doNotSyncBoundingInfo = true;

        // Parent to the anchor so roomManager setEnabled() covers it
        splat.parent = splatAnchor;
        splat.setEnabled(true);
        splatAnchor.setEnabled(true);

        console.log('[splat] loaded:', splatUrl);
      } catch (e) {
        console.error('[splat] failed to load:', splatUrl, e);
      }
    })();
  }

	return { floor, meshes };
	}
