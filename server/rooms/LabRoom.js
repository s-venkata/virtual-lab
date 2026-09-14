const { Room }                    = require("@colyseus/core");
const { Schema, MapSchema, type } = require("@colyseus/schema");
const { validateSpec }            = require("../llm/validator");

// ── PlayerState ──────────────────────────────────────────────────────────────

class PlayerState extends Schema {}
type("float32")(PlayerState.prototype, "x");
type("float32")(PlayerState.prototype, "y");
type("float32")(PlayerState.prototype, "z");
type("float32")(PlayerState.prototype, "qx");
type("float32")(PlayerState.prototype, "qy");
type("float32")(PlayerState.prototype, "qz");
type("float32")(PlayerState.prototype, "qw");
type("float32")(PlayerState.prototype, "lx1");
type("float32")(PlayerState.prototype, "ly1");
type("float32")(PlayerState.prototype, "lz1");
type("float32")(PlayerState.prototype, "lx2");
type("float32")(PlayerState.prototype, "ly2");
type("float32")(PlayerState.prototype, "lz2");
type("boolean")(PlayerState.prototype, "laserOn");
type("string") (PlayerState.prototype, "name");

// ── ObjectState ──────────────────────────────────────────────────────────────

class ObjectState extends Schema {}
type("string") (ObjectState.prototype, "ownerId");
type("float32")(ObjectState.prototype, "x");
type("float32")(ObjectState.prototype, "y");
type("float32")(ObjectState.prototype, "z");
type("float32")(ObjectState.prototype, "rotX");
type("float32")(ObjectState.prototype, "rotY");
type("float32")(ObjectState.prototype, "rotZ");
type("float32")(ObjectState.prototype, "value");

// ── LabRoomState ─────────────────────────────────────────────────────────────

class LabRoomState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.objects = new MapSchema();
  }
}
type({ map: PlayerState })(LabRoomState.prototype, "players");
type({ map: ObjectState })(LabRoomState.prototype, "objects");

// ── LabRoom ───────────────────────────────────────────────────────────────────

class LabRoom extends Room {
  maxClients  = 16;
  autoDispose = false;

  onCreate() {
    this.setState(new LabRoomState());
    this.setPatchRate(50);
    this.doorStates = { lab_door: false, dc_door: false, aiLab_door: false, outdoor_door: false };
    this.lightState = true;

    const polarizer   = new ObjectState();
    polarizer.ownerId = "";
    polarizer.x       = 23;
    polarizer.y       = 1.15;
    polarizer.z       = -2;
    polarizer.value   = 0;
    this.state.objects.set("polarizer", polarizer);

     // ââ Convex Lens experiment object ââââââââââââââââââââââââââââââââ
    const lens = new ObjectState();
    lens.ownerId = "";
    lens.x       = 22.0;
    lens.y       = 1.35;
    lens.z       = -2;
    lens.value   = 0;
    this.state.objects.set("lens", lens);

    // Convex Lens display screen (movable along the optical bench)
    const lensScreen = new ObjectState();
    lensScreen.ownerId = "";
    lensScreen.x       = 25.0;
    lensScreen.y       = 1.35;
    lensScreen.z       = -2;
    lensScreen.value   = 0;
    this.state.objects.set("lens_screen", lensScreen);

    // Convex Lens focal-length slider (variable-f simulation).
    // ObjectState.value carries the normalized slider position [0, 1].
    // focalLen = FOCAL_MIN + value * (FOCAL_MAX - FOCAL_MIN)
    //   = 1.0 + 0.3333 * (2.5 - 1.0) = 1.5 (i.e. f = 15 cm default).
    const focalSlider = new ObjectState();
    focalSlider.ownerId = "";
    focalSlider.x       = 0;
    focalSlider.y       = 0;
    focalSlider.z       = 0;
    focalSlider.value   = 0.3333;
    this.state.objects.set("lens_focal_slider", focalSlider);

    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.x  = data.x  ?? p.x;  p.y  = data.y  ?? p.y;  p.z  = data.z  ?? p.z;
      p.qx = data.qx ?? p.qx; p.qy = data.qy ?? p.qy;
      p.qz = data.qz ?? p.qz; p.qw = data.qw ?? p.qw;
      p.lx1 = data.lx1 ?? p.lx1; p.ly1 = data.ly1 ?? p.ly1; p.lz1 = data.lz1 ?? p.lz1;
      p.lx2 = data.lx2 ?? p.lx2; p.ly2 = data.ly2 ?? p.ly2; p.lz2 = data.lz2 ?? p.lz2;
      p.laserOn = data.laserOn ?? false;
    });

    this.onMessage("grabRequest", (client, data = {}) => {
      const { objectId } = data;
      const obj = this.state.objects.get(objectId);
      if (!obj) return;
      if (obj.ownerId === "" || obj.ownerId === client.sessionId) {
        obj.ownerId = client.sessionId;
        client.send("grabAccepted", { objectId });
      } else {
        client.send("grabRejected", { objectId, ownerId: obj.ownerId });
      }
    });

    this.onMessage("releaseObject", (client, data = {}) => {
      const { objectId } = data;
      const obj = this.state.objects.get(objectId);
      if (!obj) return;
      if (obj.ownerId !== client.sessionId) return;
      obj.ownerId = "";
      console.log(`[lab] object ${objectId} released by ${client.sessionId}`);
    });

    this.onMessage("updateTransform", (client, data = {}) => {
      const { objectId, x, y, z, rotX, rotY, rotZ, value } = data;
      const obj = this.state.objects.get(objectId);
      if (!obj) return;
      if (obj.ownerId !== client.sessionId) return;
      const setNum = (key, v) => { if (Number.isFinite(v)) obj[key] = v; };
      setNum("x", x);    setNum("y", y);    setNum("z", z);
      setNum("rotX", rotX); setNum("rotY", rotY); setNum("rotZ", rotZ);
      setNum("value", value);
    });

    // ── WebRTC signaling relay ────────────────────────────────────────
    const _relay = (msgType, client, data = {}) => {
      const { targetId, ...payload } = data;
      const target = this.clients.find(c => c.sessionId === targetId);
      if (target) target.send(msgType, { fromId: client.sessionId, ...payload });
    };

    this.onMessage("voiceOffer",  (client, data) => _relay("voiceOffer",  client, data));
    this.onMessage("voiceAnswer", (client, data) => _relay("voiceAnswer", client, data));
    this.onMessage("voiceIce",    (client, data) => _relay("voiceIce",    client, data));
    this.onMessage("voiceReady",  (client, data) => _relay("voiceReady",  client, data));

    // ── Demo objects ──────────────────────────────────────────────
    [
      { id: 'demo_cube',     x: -4.3, y: 1.0,  z: -5.6 },
      { id: 'demo_sphere',   x: -4.0, y: 1.0,  z: -5.6 },
      { id: 'demo_cylinder', x: -3.7, y: 1.0,  z: -5.6 },
      { id: 'demo_canister', x:  4.0, y: 1.0,  z: -5.6 },
      { id: 'demo_beaker',   x:  4.3, y: 1.0,  z: -5.6 },
      { id: 'demo_book_0',   x:  0,   y: 1.0,  z: -1.0 },
      { id: 'demo_book_1',   x:  0,   y: 1.04, z: -1.0 },
      { id: 'demo_book_2',   x:  0,   y: 1.08, z: -1.0 },
    ].forEach(({ id, x, y, z }) => {
      const obj = new ObjectState();
      obj.ownerId = ""; obj.x = x; obj.y = y; obj.z = z;
      obj.rotX = 0; obj.rotY = 0; obj.rotZ = 0; obj.value = 0;
      this.state.objects.set(id, obj);
    });

    // ── GLB models ────────────────────────────────────────────────
    const PI  = Math.PI;
    const PI2 = Math.PI / 2;
    [
      { id: 'model_fire_extinguisher', x: -7.6,  y: 0,    z:  1.25, rX: 0,   rY: PI,  rZ: 0 },
      { id: 'model_baumer',            x: -1.25, y: 1.15, z: -0.9,  rX: 0,   rY: PI,  rZ: 0 },
      { id: 'model_cable',             x: -2.25, y: 1.38, z: -0.9,  rX: PI2, rY: 0,   rZ: 0 },
      { id: 'model_motor',             x: -3.5,  y: 0.90, z: -0.9,  rX: 0,   rY: PI2, rZ: 0 },
      { id: 'model_scope',             x:  0,    y: 0,    z:  0,    rX: 0,   rY: PI,  rZ: 0 },
    ].forEach(({ id, x, y, z, rX, rY, rZ }) => {
      const obj = new ObjectState();
      obj.ownerId = ""; obj.x = x; obj.y = y; obj.z = z;
      obj.rotX = rX; obj.rotY = rY; obj.rotZ = rZ; obj.value = 0;
      this.state.objects.set(id, obj);
    });

    // ── Stern-Gerlach experiment sync ────────────────────────────
    this.onMessage("sg_fire", (client, data = {}) => {
      const spinUp = data.spinUp === true;
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) c.send("sg_fire", { spinUp });
      });
    });
    this.onMessage("sg_reset", (client) => {
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) c.send("sg_reset", {});
      });
    });

    // ── Door state sync ───────────────────────────────────────────
    this.onMessage("door_request_sync", (client) => {
      client.send("door_sync", this.doorStates);
    });

    this.onMessage("door_set", (client, data = {}) => {
      const { doorId, isOpen } = data;
      if (!["lab_door", "dc_door", "aiLab_door", "outdoor_door"].includes(doorId)) return;
      if (typeof isOpen !== "boolean") return;
      this.doorStates[doorId] = isOpen;
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) c.send("door_set", { doorId, isOpen });
      });
    });

    // ── Light switch sync ────────────────────────────────────────
    this.onMessage("light_request_sync", (client) => {
      client.send("light_sync", { state: this.lightState });
    });

    this.onMessage("light_set", (client, data = {}) => {
      const { state } = data;
      if (typeof state !== "boolean") return;
      this.lightState = state;
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) c.send("light_set", { state });
      });
    });

    // ── AI Lab — generated experiments ────────────────────────────
    // Stored as plain JS map of id → spec (JSON object). Persisted in-memory
    // for the life of the room. Late joiners receive a replay.
    this.experiments = new Map();

    this.onMessage("experiment_request_sync", (client) => {
      const specs = Array.from(this.experiments.values());
      client.send("experiment_replay", { specs });
    });

    this.onMessage("experiment_spawn", (client, data = {}) => {
      const spec = data?.spec;
      if (!spec || typeof spec !== "object") {
        client.send("experiment_error", { message: "invalid payload" });
        return;
      }
      // Basic shape check — full validation lives on the HTTP side and here
      if (typeof spec.id !== "string" || !spec.id.startsWith("exp_")) {
        client.send("experiment_error", { message: "invalid spec.id" });
        return;
      }
      if (spec.room !== "aiLab") {
        client.send("experiment_error", { message: "spec.room must be aiLab" });
        return;
      }
      if (!Array.isArray(spec.components) || spec.components.length === 0) {
        client.send("experiment_error", { message: "spec.components must be non-empty" });
        return;
      }

      // Full schema validation to reject malformed peer-side payloads
      const v = validateSpec(spec);
      if (!v.ok) {
        console.warn(`[lab] rejected spec ${spec.id}:`, v.errors);
        client.send("experiment_error", {
          message: "spec failed validation",
          errors: v.errors,
        });
        return;
      }

      // Stamp shared t₀ so every peer runs physics from the same origin.
      // Overrides anything the client may have sent.
      spec.startedAt = Date.now();

      // Replace-only policy: clear ALL previous experiments before adding the
      // new one. Tells every client to remove each one so late-joiners and
      // peers stay in sync. The originator's local clear happens client-side
      // via runtime.spawnLocal; this broadcast handles everyone else.
      for (const [oldId] of this.experiments) {
        this.clients.forEach(c => c.send("experiment_remove", { id: oldId }));
      }
      this.experiments.clear();

      this.experiments.set(spec.id, spec);
      console.log(`[lab] experiment_spawn ${spec.id} (${spec.title || "?"}) by ${client.sessionId}`);
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) c.send("experiment_spawn", { spec });
      });
    });

    this.onMessage("experiment_remove", (client, data = {}) => {
      const id = data?.id;
      if (typeof id !== "string") return;
      if (!this.experiments.has(id)) return;
      this.experiments.delete(id);
      console.log(`[lab] experiment_remove ${id} by ${client.sessionId}`);
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) c.send("experiment_remove", { id });
      });
    });
  }

  onJoin(client, options = {}) {
    const p    = new PlayerState();
    p.name     = (options.name || "").trim().slice(0, 20) || `Anon_${client.sessionId.slice(0, 4)}`;
    p.x = -3; p.y = 1.65; p.z = 5;
    p.qx = 0; p.qy = 0; p.qz = 0; p.qw = 1;
    p.lx1 = 0; p.ly1 = 0; p.lz1 = 0;
    p.lx2 = 0; p.ly2 = 0; p.lz2 = 0;
    p.laserOn = false;
    this.state.players.set(client.sessionId, p);
    console.log(`[lab] join  ${client.sessionId}  (${p.name})  total=${this.clients.length}`);
  }

  onLeave(client) {
    this.state.objects.forEach(obj => {
      if (obj.ownerId === client.sessionId) obj.ownerId = "";
    });
    this.state.players.delete(client.sessionId);
    console.log(`[lab] leave ${client.sessionId}  total=${this.clients.length}`);
  }
}

module.exports = { LabRoom };
