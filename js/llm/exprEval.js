// js/llm/exprEval.js
// Tiny safe-expression evaluator for `task.successWhen`, `physics.params` refs,
// and component param references like "string1.length".
//
// Whitelist:
//   - Numeric literals
//   - Identifiers resolved from a context map (dot-paths supported)
//   - Operators: + - * / % ** unary +/-
//   - Comparisons: > < >= <= == !=
//   - Boolean: && || !
//   - Parentheses
//   - Math functions: sin cos tan asin acos atan atan2 sqrt abs min max log exp pow floor ceil round sign
//   - Constants: pi, e
//
// No globals, no `Function`, no template literals, no member access via [].
// Anything outside the whitelist throws.

const MATH_FNS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sqrt: Math.sqrt, abs: Math.abs,
  min: Math.min, max: Math.max,
  log: Math.log, exp: Math.exp, pow: Math.pow,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};
const CONSTS = { pi: Math.PI, e: Math.E, true: true, false: false, null: null };

// ── Tokenizer ─────────────────────────────────────────────────────
function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    // Number
    if ((ch >= '0' && ch <= '9') || (ch === '.' && src[i+1] >= '0' && src[i+1] <= '9')) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      if (src[j] === 'e' || src[j] === 'E') {
        j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      toks.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    // Identifier (with dot paths)
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_.]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    // Multi-char operators
    const two = src.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||', '**'].includes(two)) {
      toks.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    // Single-char operators / punctuation
    if ('+-*/%<>!(),'.includes(ch)) {
      toks.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    throw new Error(`exprEval: unexpected char "${ch}" at ${i}`);
  }
  return toks;
}

// ── Parser (Pratt-style) ──────────────────────────────────────────
const PREC = {
  '||': 1, '&&': 2,
  '==': 3, '!=': 3,
  '>': 4, '<': 4, '>=': 4, '<=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
  '**': 7,
};

function parse(toks) {
  let i = 0;
  function peek() { return toks[i]; }
  function eat(v) {
    const t = toks[i];
    if (!t || t.v !== v) {
      throw new Error(`exprEval: expected "${v}" got ${t ? JSON.stringify(t) : 'EOF'}`);
    }
    i++;
    return t;
  }
  function parsePrimary() {
    const t = toks[i];
    if (!t) throw new Error('exprEval: unexpected EOF');
    if (t.t === 'num') { i++; return { kind: 'num', v: t.v }; }
    if (t.t === 'op' && t.v === '(') {
      i++;
      const e = parseExpr(0);
      eat(')');
      return e;
    }
    if (t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) {
      i++;
      const arg = parsePrimary();
      return { kind: 'unary', op: t.v, arg };
    }
    if (t.t === 'id') {
      i++;
      if (toks[i] && toks[i].t === 'op' && toks[i].v === '(') {
        // Function call
        i++;
        const args = [];
        if (!(toks[i] && toks[i].t === 'op' && toks[i].v === ')')) {
          args.push(parseExpr(0));
          while (toks[i] && toks[i].t === 'op' && toks[i].v === ',') {
            i++;
            args.push(parseExpr(0));
          }
        }
        eat(')');
        return { kind: 'call', name: t.v, args };
      }
      return { kind: 'id', name: t.v };
    }
    throw new Error(`exprEval: unexpected token ${JSON.stringify(t)}`);
  }
  function parseExpr(minPrec) {
    let left = parsePrimary();
    while (true) {
      const t = toks[i];
      if (!t || t.t !== 'op') break;
      const prec = PREC[t.v];
      if (prec == null || prec < minPrec) break;
      const op = t.v;
      i++;
      const right = parseExpr(prec + (op === '**' ? 0 : 1)); // ** is right-assoc
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  const root = parseExpr(0);
  if (i !== toks.length) {
    throw new Error(`exprEval: trailing tokens at index ${i}`);
  }
  return root;
}

// ── Evaluator ─────────────────────────────────────────────────────
function resolveDotPath(name, ctx) {
  if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return CONSTS[name];
  const parts = name.split('.');
  let cur = ctx;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function evalNode(node, ctx) {
  switch (node.kind) {
    case 'num': return node.v;
    case 'id': {
      const v = resolveDotPath(node.name, ctx);
      if (v === undefined) {
        throw new Error(`exprEval: unknown identifier "${node.name}"`);
      }
      return v;
    }
    case 'call': {
      const fn = MATH_FNS[node.name];
      if (!fn) throw new Error(`exprEval: unknown function "${node.name}"`);
      return fn.apply(null, node.args.map(a => evalNode(a, ctx)));
    }
    case 'unary': {
      const v = evalNode(node.arg, ctx);
      if (node.op === '-') return -v;
      if (node.op === '+') return +v;
      if (node.op === '!') return !v;
      throw new Error(`exprEval: bad unary ${node.op}`);
    }
    case 'binary': {
      const l = evalNode(node.left, ctx);
      const r = evalNode(node.right, ctx);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': return l % r;
        case '**': return l ** r;
        case '==': return l === r;
        case '!=': return l !== r;
        case '>':  return l > r;
        case '<':  return l < r;
        case '>=': return l >= r;
        case '<=': return l <= r;
        case '&&': return l && r;
        case '||': return l || r;
        default: throw new Error(`exprEval: bad binary ${node.op}`);
      }
    }
    default: throw new Error(`exprEval: bad node ${node.kind}`);
  }
}

// ── Public API ────────────────────────────────────────────────────
const _cache = new Map();

export function compileExpr(src) {
  if (typeof src !== 'string') throw new Error('compileExpr: src must be string');
  if (_cache.has(src)) return _cache.get(src);
  const ast = parse(tokenize(src));
  const fn = (ctx) => evalNode(ast, ctx);
  _cache.set(src, fn);
  return fn;
}

export function evalExpr(src, ctx) {
  return compileExpr(src)(ctx);
}

// Resolves either a literal number or a "<id>.<field>" reference against ctx.
export function resolveValue(v, ctx) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    try {
      return evalExpr(v, ctx);
    } catch {
      return undefined;
    }
  }
  return v;
}
