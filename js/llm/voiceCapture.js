// js/llm/voiceCapture.js
// Wraps MediaRecorder for short push-to-talk clips that we ship to /api/transcribe.
//
// Usage:
//   const cap = createVoiceCapture();
//   await cap.start();           // requests mic permission first time
//   // ... user holds button ...
//   const blob = await cap.stop();
//   const { ok, text } = await transcribeBlob(blob);

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of PREFERRED_MIME_TYPES) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {}
  }
  return ''; // browser default
}

export function createVoiceCapture() {
  let stream  = null;
  let recorder = null;
  let chunks   = [];
  let mime     = null;

  async function ensureStream() {
    if (stream) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
  }

  async function start() {
    await ensureStream();
    chunks = [];
    mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start();
    return true;
  }

  function stop() {
    return new Promise((resolve, reject) => {
      if (!recorder) return reject(new Error('not recording'));
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        recorder = null;
        resolve(blob);
      };
      recorder.onerror = (e) => reject(e);
      try { recorder.stop(); } catch (e) { reject(e); }
    });
  }

  function isRecording() {
    return recorder?.state === 'recording';
  }

  function release() {
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  return { start, stop, isRecording, release };
}
