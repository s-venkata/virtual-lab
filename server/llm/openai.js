// server/llm/openai.js
// Thin wrapper around the OpenAI SDK that:
//   - lazily creates the client (so server can boot without a key for dev)
//   - calls Chat Completions with json_object response_format
//   - returns parsed JSON + token usage

const { buildMessages } = require('./promptSystem');

let _client = null;

function getClient() {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  // Lazy require so dev mode without dependency installed still boots
  const { OpenAI } = require('openai');
  _client = new OpenAI({ apiKey: key });
  return _client;
}

async function generateExperimentSpec(prompt, opts = {}) {
  const client = getClient();
  if (!client) {
    return { ok: false, error: 'OPENAI_API_KEY not set' };
  }
  const model = opts.model || process.env.OPENAI_MODEL || 'gpt-4o';
  const messages = buildMessages(prompt);

  let resp;
  try {
    resp = await client.chat.completions.create({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: 2048,
    });
  } catch (e) {
    return { ok: false, error: `openai: ${e.message}` };
  }

  const content = resp.choices?.[0]?.message?.content || '';
  let spec;
  try {
    spec = JSON.parse(content);
  } catch (e) {
    return { ok: false, error: `JSON parse failed: ${e.message}`, raw: content };
  }
  return { ok: true, spec, usage: resp.usage, model };
}

async function transcribeAudio(buffer, filename = 'audio.webm') {
  const client = getClient();
  if (!client) return { ok: false, error: 'OPENAI_API_KEY not set' };
  const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';

  // OpenAI Node SDK v4 takes a File or fs.ReadStream; we wrap a Buffer
  const { toFile } = require('openai/uploads');
  let file;
  try {
    file = await toFile(buffer, filename);
  } catch (e) {
    return { ok: false, error: `toFile: ${e.message}` };
  }

  try {
    const resp = await client.audio.transcriptions.create({ model, file });
    return { ok: true, text: resp.text || '', model };
  } catch (e) {
    return { ok: false, error: `whisper: ${e.message}` };
  }
}

module.exports = { generateExperimentSpec, transcribeAudio };
