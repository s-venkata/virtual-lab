// server/llm/validator.js
// Server-side validator using Ajv.
// Loaded synchronously so the validate function is always ready.

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const schemaPath = path.join(__dirname, 'schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

function validateSpec(spec) {
  const ok = validate(spec);
  if (ok) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`),
  };
}

module.exports = { validateSpec, schema };
