// server/llm/budget.js (CommonJS)
// Lightweight in-memory daily budget tracker.

const COST_PER_M_INPUT  = { 'gpt-4o': 5.00, 'gpt-4o-mini': 0.15, 'gpt-4-turbo': 10.00 };
const COST_PER_M_OUTPUT = { 'gpt-4o': 15.0, 'gpt-4o-mini': 0.60, 'gpt-4-turbo': 30.00 };
const WHISPER_USD_PER_MIN = 0.006;

let _spent = 0;
let _today = startOfUtcDay();
const _ceiling = parseFloat(process.env.DAILY_BUDGET_USD || '0');

function startOfUtcDay() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function rolloverIfNeeded() {
  const t = startOfUtcDay();
  if (t !== _today) {
    _today = t;
    _spent = 0;
    console.log('[budget] daily reset');
  }
}

function checkBudget() {
  rolloverIfNeeded();
  if (_ceiling <= 0) return { ok: true, spent: _spent, ceiling: 0 };
  return { ok: _spent < _ceiling, spent: _spent, ceiling: _ceiling };
}

function recordChat(model, usage) {
  rolloverIfNeeded();
  if (!usage) return;
  const inP  = COST_PER_M_INPUT[model]  || 5;
  const outP = COST_PER_M_OUTPUT[model] || 15;
  const cost = ((usage.prompt_tokens || 0) / 1e6) * inP
             + ((usage.completion_tokens || 0) / 1e6) * outP;
  _spent += cost;
  console.log(`[budget] +$${cost.toFixed(4)} (${model}) total=$${_spent.toFixed(4)}`);
}

function recordWhisper(seconds = 0) {
  rolloverIfNeeded();
  const minutes = seconds / 60;
  const cost = minutes * WHISPER_USD_PER_MIN;
  _spent += cost;
  console.log(`[budget] +$${cost.toFixed(4)} (whisper, ${seconds.toFixed(1)}s) total=$${_spent.toFixed(4)}`);
}

module.exports = { checkBudget, recordChat, recordWhisper };
