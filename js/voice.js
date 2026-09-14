import { getStateCallbacks } from 'colyseus.js';

// WebRTC ICE server configuration
// - Public repo default: STUN-only (no credentials).
// - If you want TURN in production, inject an ICE server list at runtime:
//     window.VR_LAB_ICE_SERVERS = [{ urls, username, credential }, ...]
//   before this module runs (e.g. from a small inline script tag in index.html
//   or a separate config JS served by your deployment).
function getIceServers() {
  const injected = globalThis?.VR_LAB_ICE_SERVERS;
  if (Array.isArray(injected) && injected.length) return injected;
  return [
    { urls: 'stun:stun.l.google.com:19302' },
  ];
}


let _room          = null;
let _voiceStarted  = false;
let localStream    = null;
const peers        = new Map();   // sessionId → RTCPeerConnection
const _audio       = new Map();   // sessionId → HTMLAudioElement
const _iceBufs     = new Map();   // sessionId → candidate[] buffered before remoteDescription
let isMuted        = false;

// ── Public API ────────────────────────────────────────────────────────────────

export async function initVoice(room) {
  if (!room) {
    console.warn("[voice] No Colyseus room available");
    return false;
  }
  if (_voiceStarted) return true;   // idempotent — don't register duplicate handlers
  _voiceStarted = true;

  _room = room;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    _voiceStarted = false;   // allow retry if mic permission was temporarily denied
    console.warn("[voice] Microphone access denied:", e.message);
    return false;
  }

  const $ = getStateCallbacks(room);
  const myId = room.sessionId;

  room.onMessage("voiceOffer",  (data) => handleOffer(data));
  room.onMessage("voiceAnswer", (data) => handleAnswer(data));
  room.onMessage("voiceIce",    (data) => handleIce(data));
  room.onMessage("voiceReady",  ({ fromId }) => {
    if (myId < fromId) createOffer(fromId);
  });

  $(room.state).players.onAdd((_player, sid) => {
    if (sid === myId) return;
    if (myId < sid) createOffer(sid);
  });

  $(room.state).players.onRemove((_player, sid) => {
    closePeer(sid);
  });

  // Connect to players already in the room before initVoice() was called.
  // onAdd does not fire for existing entries — must loop explicitly.
  room.state.players.forEach((_player, sid) => {
    if (sid === myId) return;
    if (myId < sid) {
      createOffer(sid);
    } else {
      room.send("voiceReady", { targetId: sid });
    }
  });

  console.log("[voice] initialised — mic active");
  return true;
}

export function toggleMute() {
  isMuted = !isMuted;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
  }
  return isMuted;
}

export function isMutedState() {
  return isMuted;
}

export function isVoiceStarted() {
  return _voiceStarted;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _newPeer(remoteId) {
  if (peers.has(remoteId)) {
    const old = peers.get(remoteId);
    try { old.close(); } catch {}
    peers.delete(remoteId);
  }

  const pc = new RTCPeerConnection({ iceServers: getIceServers() });
  _iceBufs.set(remoteId, []);

  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      _room.send("voiceIce", { targetId: remoteId, candidate: candidate.toJSON() });
    }
  };

  pc.ontrack = ({ streams }) => {
    if (streams[0]) attachAudio(remoteId, streams[0]);
  };

  peers.set(remoteId, pc);
  return pc;
}

async function createOffer(targetId) {
  const pc = _newPeer(targetId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  _room.send("voiceOffer", { targetId, sdp: offer.sdp });
}

async function handleOffer({ fromId, sdp }) {
  const pc = _newPeer(fromId);
  await pc.setRemoteDescription({ type: "offer", sdp });
  const buf = _iceBufs.get(fromId) ?? [];
  for (const c of buf) {
    try { await pc.addIceCandidate(c); } catch {}
  }
  _iceBufs.delete(fromId);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  _room.send("voiceAnswer", { targetId: fromId, sdp: answer.sdp });
}

async function handleAnswer({ fromId, sdp }) {
  const pc = peers.get(fromId);
  if (!pc) return;
  await pc.setRemoteDescription({ type: "answer", sdp });
  const buf = _iceBufs.get(fromId) ?? [];
  for (const c of buf) {
    try { await pc.addIceCandidate(c); } catch {}
  }
  _iceBufs.delete(fromId);
}

async function handleIce({ fromId, candidate }) {
  if (!candidate) return;
  const c  = new RTCIceCandidate(candidate);
  const pc = peers.get(fromId);

  if (!pc || !pc.remoteDescription) {
    if (!_iceBufs.has(fromId)) _iceBufs.set(fromId, []);
    _iceBufs.get(fromId).push(c);
    return;
  }

  try { await pc.addIceCandidate(c); } catch (e) {
    console.warn("[voice] ICE candidate failed:", e.message);
  }
}

function attachAudio(sessionId, stream) {
  let el = _audio.get(sessionId);
  if (!el) {
    el = document.createElement("audio");
    el.autoplay    = true;
    el.playsInline = true;
    document.body.appendChild(el);
    _audio.set(sessionId, el);
  }
  el.srcObject = stream;
}

function closePeer(sessionId) {
  const pc = peers.get(sessionId);
  if (pc) { pc.close(); peers.delete(sessionId); }
  _iceBufs.delete(sessionId);

  const el = _audio.get(sessionId);
  if (el) { el.srcObject = null; el.remove(); _audio.delete(sessionId); }
}
