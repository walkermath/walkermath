// src/lib/lesson/mathcheck.ts
// Marks a typed algebra answer against the teacher's key. Pure functions, no framework or storage,
// like pacing.ts: the live room, the control panel, the reports and the editor all call it.
//
// Two ways to match, set per question:
//   'form'  Same form, any order (the default). Terms of a sum and factors of a product may come in
//           any order, and plain arithmetic on numbers is done (2*3 = 6, 0.5 = 1/2), but nothing is
//           expanded, factored or combined. So (x+2)(x+5) matches (x+5)(x+2) but not x^2+7x+10,
//           and 2(x+3) does not match 2x+6.
//   'any'   Any equivalent form: also accepts x^2+7x+10, 2x+6, sqrt(8) for 2sqrt(2), i^2 for -1.
//           Checked by comparing the two expressions at many fixed test values.
//
// Equations and inequalities must have the same shape on both sides: x = 7 matches 7 = x, but x+5 = 12
// does not match x = 7, even in 'any' mode. Several answers ("x=3 or x=-3", "x=±3") match as a set.
// A key without "=" also accepts "x = <answer>" ("7" accepts "x = 7").
//
// What it reads: + - * / ^, implicit multiplication (2x, 3(x+1), (x+1)(x-1)), parentheses, sqrt, abs,
// pi, i (the imaginary unit), ± , ² ³ √ × · ÷ −, ordered pairs, and "or"/"and"/"," between answers.
// A letter followed by a digit ("x2") is refused as unclear.

export type MathMatch = 'form' | 'any';

export class ReadError extends Error {}
const fail = (msg: string): never => {
  throw new ReadError(msg);
};

/* ---------------- exact rationals ---------------- */

interface Q {
  n: bigint;
  d: bigint;
}
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
const mk = (n: bigint, d: bigint = 1n): Q => {
  if (d === 0n) return fail('That divides by zero.');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  const r = { n: n / g, d: d / g };
  if (r.n.toString().length > 60 || r.d.toString().length > 60) fail('That number is too big.');
  return r;
};
const qAdd = (a: Q, b: Q) => mk(a.n * b.d + b.n * a.d, a.d * b.d);
const qMul = (a: Q, b: Q) => mk(a.n * b.n, a.d * b.d);
const qEq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
const qIsInt = (a: Q) => a.d === 1n;
const qIs = (a: Q, n: number) => a.d === 1n && a.n === BigInt(n);
const ZERO = mk(0n);
const ONE = mk(1n);
const MINUS_ONE = mk(-1n);

function qPowInt(a: Q, k: number): Q {
  if (k < 0) {
    if (a.n === 0n) return fail('That divides by zero.');
    return qPowInt(mk(a.d, a.n), -k);
  }
  let r = ONE;
  for (let i = 0; i < k; i++) r = qMul(r, a);
  return r;
}

/** Exact integer k-th root, or null. */
function iroot(n: bigint, k: number): bigint | null {
  if (n < 0n) return null;
  let lo = 0n;
  let hi = n < 2n ? 1n : n;
  const K = BigInt(k);
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (mid ** K < n) lo = mid + 1n;
    else hi = mid;
  }
  return lo ** K === n ? lo : null;
}

function parseDecimal(s: string): Q {
  const t = s.replace(/,/g, '').replace(/\.$/, '');
  const [whole, frac = ''] = t.split('.');
  return mk(BigInt((whole || '0') + frac), 10n ** BigInt(frac.length));
}

/* ---------------- syntax tree ---------------- */

type Rel = '=' | '<' | '>' | '<=' | '>=';
type Node =
  | { t: 'n'; v: Q }
  | { t: 'v'; name: string }
  | { t: 'add'; xs: Node[] }
  | { t: 'mul'; xs: Node[] }
  | { t: 'pow'; b: Node; e: Node }
  | { t: 'fn'; f: 'sqrt' | 'abs'; x: Node }
  | { t: 'pm'; x: Node }
  | { t: 'tuple'; xs: Node[] }
  | { t: 'rel'; op: Rel; l: Node; r: Node };

const num = (v: Q): Node => ({ t: 'n', v });
const neg = (x: Node): Node => ({ t: 'mul', xs: [num(MINUS_ONE), x] });
const FLIP: Record<Rel, Rel> = { '=': '=', '<': '>', '>': '<', '<=': '>=', '>=': '<=' };

/* ---------------- reading the text ---------------- */

type Tok = { k: 'num' | 'id' | 'op' | 'sep'; v: string };

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const WORDS = new Set(['sqrt', 'abs', 'pi']);
const SEP_WORDS = new Set(['or', 'and']);
export const MATH_MAX = 200;

function tokenize(input: string): Tok[] {
  if (input.length > MATH_MAX) fail(`Keep it under ${MATH_MAX} characters.`);
  const s = input
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => `^(${[...m].map((c) => SUP[c]).join('')})`)
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√/g, ' sqrt ')
    .replace(/π/g, ' pi ')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[[{]/g, '(')
    .replace(/[\]}]/g, ')');
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpExecArray | null;
    if (/^\s/.test(rest)) {
      i++;
    } else if ((m = /^\d{1,3}(,\d{3})+(\.\d*)?/.exec(rest)) || (m = /^(\d+(\.\d*)?|\.\d+)/.exec(rest))) {
      toks.push({ k: 'num', v: m[0] });
      i += m[0].length;
    } else if ((m = /^[A-Za-z]+/.exec(rest))) {
      const run = m[0].toLowerCase();
      i += m[0].length;
      if (SEP_WORDS.has(run)) toks.push({ k: 'sep', v: 'or' });
      else if (WORDS.has(run)) toks.push({ k: 'id', v: run });
      else {
        for (const ch of run) toks.push({ k: 'id', v: ch });
        const next = /^\d+/.exec(s.slice(i));
        if (next) fail(`"${m[0]}${next[0]}" is unclear. Use ^ for an exponent (x^2) or * to multiply (x*2).`);
      }
    } else if ((m = /^(<=|>=|==)/.exec(rest))) {
      toks.push({ k: 'op', v: m[0] === '==' ? '=' : m[0] });
      i += 2;
    } else if (/^[-+*/^()=<>±]/.test(rest)) {
      toks.push({ k: 'op', v: rest[0] });
      i++;
    } else if (rest[0] === ',' || rest[0] === ';') {
      toks.push({ k: 'sep', v: rest[0] });
      i++;
    } else {
      fail(`I can't read "${rest[0]}".`);
    }
  }
  if (toks.length === 0) fail('Nothing to read.');
  if (toks.length > 150) fail('That is too long to read.');
  return toks;
}

const RELS = ['=', '<', '>', '<=', '>='];

function parseAll(text: string): Node[] {
  const toks = tokenize(text);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.k === 'op' && peek()!.v === v;
  const startsAtom = (t: Tok | undefined) => !!t && (t.k === 'num' || t.k === 'id' || (t.k === 'op' && t.v === '('));
  const shown = (t: Tok) => (t.k === 'sep' ? t.v : t.v);

  function parseRel(): Node {
    const l = parseExpr();
    const t = peek();
    if (t?.k === 'op' && RELS.includes(t.v)) {
      pos++;
      const r = parseExpr();
      return { t: 'rel', op: t.v as Rel, l, r };
    }
    return l;
  }
  function parseExpr(): Node {
    let acc = parseTerm();
    for (;;) {
      if (isOp('+')) {
        pos++;
        acc = { t: 'add', xs: [acc, parseTerm()] };
      } else if (isOp('-')) {
        pos++;
        acc = { t: 'add', xs: [acc, neg(parseTerm())] };
      } else if (isOp('±')) {
        pos++;
        acc = { t: 'add', xs: [acc, { t: 'pm', x: parseTerm() }] };
      } else return acc;
    }
  }
  function parseTerm(): Node {
    let acc = parseUnary();
    for (;;) {
      if (isOp('*')) {
        pos++;
        acc = { t: 'mul', xs: [acc, parseUnary()] };
      } else if (isOp('/')) {
        pos++;
        acc = { t: 'mul', xs: [acc, { t: 'pow', b: parseUnary(), e: num(MINUS_ONE) }] };
      } else if (startsAtom(peek())) {
        acc = { t: 'mul', xs: [acc, parsePower()] };
      } else return acc;
    }
  }
  function parseUnary(): Node {
    if (isOp('-')) {
      pos++;
      return neg(parseUnary());
    }
    if (isOp('+')) {
      pos++;
      return parseUnary();
    }
    if (isOp('±')) {
      pos++;
      return { t: 'pm', x: parseUnary() };
    }
    return parsePower();
  }
  function parsePower(): Node {
    const base = parseAtom();
    if (isOp('^')) {
      pos++;
      return { t: 'pow', b: base, e: parseExponent() };
    }
    return base;
  }
  function parseExponent(): Node {
    if (isOp('-')) {
      pos++;
      return neg(parseExponent());
    }
    if (isOp('+')) {
      pos++;
      return parseExponent();
    }
    return parsePower();
  }
  function parseGroup(): Node {
    const first = parseRel();
    const items = [first];
    while (peek()?.k === 'sep' && peek()!.v === ',') {
      pos++;
      items.push(parseRel());
    }
    if (!isOp(')')) fail('A ( is missing its ).');
    pos++;
    return items.length > 1 ? { t: 'tuple', xs: items } : first;
  }
  function parseAtom(): Node {
    const t = toks[pos++];
    if (!t) return fail('The answer stops too soon.');
    if (t.k === 'num') return num(parseDecimal(t.v));
    if (t.k === 'op' && t.v === '(') return parseGroup();
    if (t.k === 'id') {
      if (t.v === 'sqrt') {
        if (isOp('(')) {
          pos++;
          return { t: 'fn', f: 'sqrt', x: parseGroup() };
        }
        return { t: 'fn', f: 'sqrt', x: parseAtom() };
      }
      if (t.v === 'abs') {
        if (!isOp('(')) fail('Write abs(...) with parentheses.');
        pos++;
        return { t: 'fn', f: 'abs', x: parseGroup() };
      }
      return { t: 'v', name: t.v };
    }
    return fail(t.k === 'op' && t.v === ')' ? 'There is a ) with no ( before it.' : `I didn't expect "${shown(t)}" there.`);
  }

  const alts = [parseRel()];
  while (peek()?.k === 'sep') {
    pos++;
    alts.push(parseRel());
  }
  if (pos < toks.length) fail(toks[pos].v === ')' ? 'There is a ) with no ( before it.' : `I didn't expect "${shown(toks[pos])}" there.`);
  return alts;
}

/* ---------------- ± : one answer becomes two ---------------- */

function cartesian(lists: Node[][]): Node[][] {
  let out: Node[][] = [[]];
  for (const l of lists) {
    const next: Node[][] = [];
    for (const o of out) for (const x of l) next.push([...o, x]);
    out = next;
    if (out.length > 16) fail('Too many ± signs.');
  }
  return out;
}

function expandPm(n: Node): Node[] {
  switch (n.t) {
    case 'n':
    case 'v':
      return [n];
    case 'pm': {
      const xs = expandPm(n.x);
      return [...xs, ...xs.map(neg)];
    }
    case 'add':
    case 'mul':
    case 'tuple':
      return cartesian(n.xs.map(expandPm)).map((xs) => ({ t: n.t, xs }) as Node);
    case 'pow':
      return cartesian([expandPm(n.b), expandPm(n.e)]).map(([b, e]) => ({ t: 'pow', b, e }) as Node);
    case 'fn':
      return expandPm(n.x).map((x) => ({ t: 'fn', f: n.f, x }) as Node);
    case 'rel':
      return cartesian([expandPm(n.l), expandPm(n.r)]).map(([l, r]) => ({ t: 'rel', op: n.op, l, r }) as Node);
  }
}

/* ---------------- same form, any order ---------------- */

function key(n: Node): string {
  switch (n.t) {
    case 'n':
      return `#${n.v.n}/${n.v.d}`;
    case 'v':
      return n.name;
    case 'add':
      return `+(${n.xs.map(key).join(',')})`;
    case 'mul':
      return `*(${n.xs.map(key).join(',')})`;
    case 'pow':
      return `^(${key(n.b)},${key(n.e)})`;
    case 'fn':
      return `${n.f}(${key(n.x)})`;
    case 'pm':
      return `±(${key(n.x)})`;
    case 'tuple':
      return `T(${n.xs.map(key).join(',')})`;
    case 'rel':
      return `${n.op}(${key(n.l)};${key(n.r)})`;
  }
}

const asNum = (n: Node): Q | null => (n.t === 'n' ? n.v : null);

function normPow(b: Node, e: Node): Node {
  const ev = asNum(e);
  if (ev) {
    if (qIs(ev, 0)) return num(ONE);
    if (qIs(ev, 1)) return b;
    const bv = asNum(b);
    if (bv && qIsInt(ev)) {
      if (Math.abs(Number(ev.n)) <= 64) return num(qPowInt(bv, Number(ev.n)));
    } else if (bv && ev.d <= 6n && bv.n >= 0n) {
      const rn = iroot(bv.n, Number(ev.d));
      const rd = iroot(bv.d, Number(ev.d));
      if (rn !== null && rd !== null && Math.abs(Number(ev.n)) <= 64) return num(qPowInt(mk(rn, rd), Number(ev.n)));
    }
    if (b.t === 'pow' && asNum(b.e) && qIsInt(ev)) return normPow(b.b, num(qMul(asNum(b.e)!, ev)));
  }
  return { t: 'pow', b, e };
}

function norm(n: Node): Node {
  switch (n.t) {
    case 'n':
    case 'v':
      return n;
    case 'pm':
      return { t: 'pm', x: norm(n.x) };
    case 'tuple':
      return { t: 'tuple', xs: n.xs.map(norm) };
    case 'rel':
      return { t: 'rel', op: n.op, l: norm(n.l), r: norm(n.r) };
    case 'fn': {
      const x = norm(n.x);
      if (n.f === 'sqrt') return normPow(x, num(mk(1n, 2n)));
      const xv = asNum(x);
      return xv ? num(mk(xv.n < 0n ? -xv.n : xv.n, xv.d)) : { t: 'fn', f: 'abs', x };
    }
    case 'pow':
      return normPow(norm(n.b), norm(n.e));
    case 'add': {
      const terms: Node[] = [];
      let sum = ZERO;
      const take = (x: Node) => {
        if (x.t === 'add') x.xs.forEach(take);
        else if (x.t === 'n') sum = qAdd(sum, x.v);
        else terms.push(x);
      };
      n.xs.forEach((c) => take(norm(c)));
      if (!qIs(sum, 0)) terms.push(num(sum));
      terms.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      return terms.length === 0 ? num(ZERO) : terms.length === 1 ? terms[0] : { t: 'add', xs: terms };
    }
    case 'mul': {
      let coef = ONE;
      // Factors with the same base share one exponent. Positive and negative exponents are kept
      // apart, so (x+2)(x+5)/(x+5) is not quietly reduced to x+2.
      const groups = new Map<string, { base: Node; exp: Q }>();
      const others: Node[] = [];
      const take = (x: Node) => {
        if (x.t === 'mul') x.xs.forEach(take);
        else if (x.t === 'n') coef = qMul(coef, x.v);
        else {
          const base = x.t === 'pow' && asNum(x.e) ? x.b : x;
          const exp = x.t === 'pow' && asNum(x.e) ? asNum(x.e)! : ONE;
          const g = `${exp.n < 0n ? '-' : '+'}${key(base)}`;
          const had = groups.get(g);
          if (had) had.exp = qAdd(had.exp, exp);
          else groups.set(g, { base, exp });
        }
      };
      n.xs.forEach((c) => take(norm(c)));
      for (const { base, exp } of groups.values()) {
        const r = normPow(base, num(exp));
        if (r.t === 'n') coef = qMul(coef, r.v);
        else others.push(r);
      }
      if (qIs(coef, 0)) return num(ZERO);
      others.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      if (others.length === 0) return num(coef);
      if (qIs(coef, 1) && others.length === 1) return others[0];
      return { t: 'mul', xs: qIs(coef, 1) ? others : [num(coef), ...others] };
    }
  }
}

/** "3/4" typed as a fraction of two whole numbers: { p, q, negative }, else null. */
function plainFraction(n: Node): { p: bigint; q: bigint; negative: boolean } | null {
  const fs: Node[] = [];
  const flat = (x: Node) => (x.t === 'mul' ? x.xs.forEach(flat) : fs.push(x));
  flat(n);
  let negative = false;
  let p: bigint | null = null;
  let q: bigint | null = null;
  for (const f of fs) {
    if (f.t === 'n' && qIs(f.v, -1)) negative = !negative;
    else if (f.t === 'n' && qIsInt(f.v) && p === null) p = f.v.n;
    else if (f.t === 'pow' && f.e.t === 'n' && qIs(f.e.v, -1) && f.b.t === 'n' && qIsInt(f.b.v) && q === null) q = f.b.v.n;
    else return null;
  }
  return p !== null && q !== null ? { p, q, negative } : null;
}

function sameForm(k: Node, a: Node): boolean {
  const nk = norm(k);
  const na = norm(a);
  if (nk.t === 'n' && na.t === 'n') {
    // A key written as a fraction wants that fraction (6/8 is not 3/4); anything else, the value.
    const fk = plainFraction(k);
    const fa = plainFraction(a);
    if (fk && fa) return fk.p === fa.p && fk.q === fa.q && fk.negative === fa.negative;
    return qEq(nk.v, na.v);
  }
  return key(nk) === key(na);
}

/* ---------------- any equivalent form ---------------- */

type C = [number, number];
const cAdd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const cMul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cAbs = (a: C) => Math.hypot(a[0], a[1]);
const cDiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
function cPow(b: C, e: C): C {
  if (e[1] === 0 && Number.isInteger(e[0]) && Math.abs(e[0]) <= 64) {
    let r: C = [1, 0];
    for (let i = 0; i < Math.abs(e[0]); i++) r = cMul(r, b);
    return e[0] < 0 ? cDiv([1, 0], r) : r;
  }
  if (b[0] === 0 && b[1] === 0) return e[0] > 0 ? [0, 0] : [NaN, NaN];
  const logAbs = Math.log(cAbs(b));
  const arg = Math.atan2(b[1], b[0]);
  const mag = Math.exp(e[0] * logAbs - e[1] * arg);
  const ang = e[1] * logAbs + e[0] * arg;
  return [mag * Math.cos(ang), mag * Math.sin(ang)];
}

function evalAt(n: Node, env: Map<string, number>): C {
  switch (n.t) {
    case 'n':
      return [Number(n.v.n) / Number(n.v.d), 0];
    case 'v':
      if (n.name === 'i') return [0, 1];
      if (n.name === 'pi') return [Math.PI, 0];
      return [env.get(n.name) ?? 1, 0];
    case 'add':
      return n.xs.map((x) => evalAt(x, env)).reduce(cAdd);
    case 'mul':
      return n.xs.map((x) => evalAt(x, env)).reduce(cMul);
    case 'pow':
      return cPow(evalAt(n.b, env), evalAt(n.e, env));
    case 'fn': {
      const x = evalAt(n.x, env);
      return n.f === 'sqrt' ? cPow(x, [0.5, 0]) : [cAbs(x), 0];
    }
    default:
      return [NaN, NaN];
  }
}

function vars(n: Node, out = new Set<string>()): Set<string> {
  if (n.t === 'v') {
    if (n.name !== 'i' && n.name !== 'pi') out.add(n.name);
  } else if (n.t === 'add' || n.t === 'mul' || n.t === 'tuple') n.xs.forEach((x) => vars(x, out));
  else if (n.t === 'pow') [n.b, n.e].forEach((x) => vars(x, out));
  else if (n.t === 'fn' || n.t === 'pm') vars(n.x, out);
  else if (n.t === 'rel') [n.l, n.r].forEach((x) => vars(x, out));
  return out;
}

/** Fixed pseudo-random numbers, so a given answer always gets the same mark. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sameValue(k: Node, a: Node): boolean {
  const names = [...new Set([...vars(k), ...vars(a)])].sort();
  const rand = mulberry32(20261102);
  const trials = names.length ? 9 : 1;
  let valid = 0;
  for (let t = 0; t < trials; t++) {
    const env = new Map<string, number>();
    for (const name of names) env.set(name, (rand() < 0.5 ? -1 : 1) * (0.6 + Math.round(rand() * 2800) / 1000));
    const zk = evalAt(k, env);
    const za = evalAt(a, env);
    if (![...zk, ...za].every(Number.isFinite)) continue;
    valid++;
    const tol = 1e-9 * Math.max(1, cAbs(zk), cAbs(za));
    if (cAbs([zk[0] - za[0], zk[1] - za[1]]) > tol) return false;
  }
  return valid >= (names.length ? 3 : 1);
}

/* ---------------- comparing answers ---------------- */

function same(k: Node, a: Node, mode: MathMatch, relax: boolean): boolean {
  if (k.t === 'tuple' || a.t === 'tuple') {
    return k.t === 'tuple' && a.t === 'tuple' && k.xs.length === a.xs.length && k.xs.every((x, i) => same(x, a.xs[i], mode, false));
  }
  if (k.t === 'rel' || a.t === 'rel') {
    if (k.t === 'rel' && a.t === 'rel') {
      const direct = k.op === a.op && same(k.l, a.l, mode, false) && same(k.r, a.r, mode, false);
      return direct || (FLIP[k.op] === a.op && same(k.l, a.r, mode, false) && same(k.r, a.l, mode, false));
    }
    // A key of "7" accepts "x = 7" (a lone letter on the left), never the other way round.
    if (relax && k.t !== 'rel' && a.t === 'rel') return a.op === '=' && a.l.t === 'v' && a.l.name !== 'i' && a.l.name !== 'pi' && same(k, a.r, mode, false);
    return false;
  }
  return sameForm(k, a) || (mode === 'any' && sameValue(k, a));
}

function altsOf(text: string): Node[] {
  return parseAll(text).flatMap(expandPm);
}

function dedupe(list: Node[], mode: MathMatch): Node[] {
  const out: Node[] = [];
  for (const n of list) if (!out.some((m) => same(m, n, mode, false))) out.push(n);
  return out;
}

const plain = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * true when the typed answer matches the key (every answer in it, no extras), false otherwise.
 * A key that cannot be read falls back to a plain text match so a bad key never marks everyone wrong.
 */
export function checkMath(key: string, answer: string, mode: MathMatch = 'form'): boolean {
  let keys: Node[];
  try {
    keys = dedupe(altsOf(key), mode);
  } catch {
    return plain(key) === plain(answer);
  }
  try {
    const answers = dedupe(altsOf(answer), mode);
    if (answers.length !== keys.length) return false;
    const used = new Set<number>();
    return keys.every((k) => {
      const i = answers.findIndex((a, j) => !used.has(j) && same(k, a, mode, true));
      if (i < 0) return false;
      used.add(i);
      return true;
    });
  } catch {
    return false;
  }
}

/* ---------------- "we read that as..." ---------------- */

const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function fmtQ(v: Q): string {
  if (v.d === 1n) return v.n.toString();
  // A finite decimal (0.5, 12.25) is shown as one; anything else as a fraction.
  let twos = 0;
  let fives = 0;
  let d = v.d;
  while (d % 2n === 0n) (d /= 2n), twos++;
  while (d % 5n === 0n) (d /= 5n), fives++;
  if (d !== 1n) return `${v.n}/${v.d}`;
  const scale = Math.max(twos, fives);
  const digits = ((v.n < 0n ? -v.n : v.n) * (10n ** BigInt(scale) / v.d)).toString().padStart(scale + 1, '0');
  return `${v.n < 0n ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

const isAtomic = (s: string) => /^[A-Za-zπ]$|^\d+(\.\d+)?$/.test(s);
const wrap = (s: string) => `(${s})`;

function show(n: Node, level: 0 | 1 | 2 = 0): string {
  switch (n.t) {
    case 'n':
      return fmtQ(n.v);
    case 'v':
      return n.name === 'pi' ? 'π' : n.name;
    case 'add': {
      const terms: Node[] = [];
      const flat = (x: Node) => (x.t === 'add' ? x.xs.forEach(flat) : terms.push(x));
      flat(n);
      const s = terms.map((t, i) => {
        const r = show(t, 0);
        return i === 0 ? r : r.startsWith('-') ? ` − ${r.slice(1)}` : ` + ${r}`;
      });
      const out = s.join('');
      return level >= 1 ? wrap(out) : out;
    }
    case 'mul': {
      const fs: Node[] = [];
      const flat = (x: Node) => (x.t === 'mul' ? x.xs.forEach(flat) : fs.push(x));
      flat(n);
      const isInv = (f: Node): f is Extract<Node, { t: 'pow' }> => f.t === 'pow' && f.e.t === 'n' && qIs(f.e.v, -1);
      let top = fs.filter((f) => !isInv(f));
      const bottom = fs.filter(isInv).map((f) => f.b);
      let sign = '';
      if (top.length > 1 && top[0].t === 'n' && qIs(top[0].v, -1)) {
        sign = '-';
        top = top.slice(1);
      }
      if (top.length > 1) top = top.filter((f) => !(f.t === 'n' && qIs(f.v, 1)));
      let out = '';
      for (const f of top) {
        const s = show(f, 1);
        const dot = (/\d$/.test(out) && /^[\d.]/.test(s)) || (/[A-Za-zπ)]$/.test(out) && /^\d/.test(s));
        out += (out && dot ? ' · ' : '') + s;
      }
      if (bottom.length) {
        const den = bottom.map((b) => show(b, 1)).join('');
        out = `${out || '1'} / ${isAtomic(den) ? den : den.startsWith('(') ? den : wrap(den)}`;
        return sign + (level >= 1 ? wrap(out) : out);
      }
      return sign + out;
    }
    case 'pow': {
      if (n.e.t === 'n' && qIs(n.e.v, -1)) return `1 / ${isAtomic(show(n.b, 1)) ? show(n.b, 1) : wrap(show(n.b, 0))}`;
      const base = n.b.t === 'n' || n.b.t === 'v' ? show(n.b) : n.b.t === 'fn' ? show(n.b) : wrap(show(n.b, 0));
      if (n.e.t === 'n' && qIsInt(n.e.v) && n.e.v.n >= 0n && n.e.v.n <= 9n) return base + SUPD[Number(n.e.v.n)];
      const ex = show(n.e, 2);
      return `${base}^${isAtomic(ex) || ex.startsWith('(') ? ex : wrap(ex)}`;
    }
    case 'fn': {
      const x = show(n.x, 0);
      return n.f === 'sqrt' ? `√${isAtomic(x) ? x : wrap(x)}` : `|${x}|`;
    }
    case 'pm':
      return `±${show(n.x, 1)}`;
    case 'tuple':
      return `(${n.xs.map((x) => show(x, 0)).join(', ')})`;
    case 'rel':
      return `${show(n.l, 0)} ${n.op === '<=' ? '≤' : n.op === '>=' ? '≥' : n.op} ${show(n.r, 0)}`;
  }
}

/* The same reading as LaTeX, for a typeset preview (KaTeX). Fractions stack, powers rise. */

function texQ(v: Q): string {
  const s = fmtQ(v);
  return s.includes('/') ? `\\frac{${v.n}}{${v.d}}` : s;
}

function tex(n: Node, level: 0 | 1 | 2 = 0): string {
  const paren = (s: string) => `\\left(${s}\\right)`;
  switch (n.t) {
    case 'n':
      return texQ(n.v);
    case 'v':
      return n.name === 'pi' ? '\\pi' : n.name;
    case 'add': {
      const terms: Node[] = [];
      const flat = (x: Node) => (x.t === 'add' ? x.xs.forEach(flat) : terms.push(x));
      flat(n);
      const out = terms
        .map((t, i) => {
          const r = tex(t, 0);
          return i === 0 ? r : r.startsWith('-') ? ` - ${r.slice(1)}` : ` + ${r}`;
        })
        .join('');
      return level >= 1 ? paren(out) : out;
    }
    case 'mul': {
      const fs: Node[] = [];
      const flat = (x: Node) => (x.t === 'mul' ? x.xs.forEach(flat) : fs.push(x));
      flat(n);
      const isInv = (f: Node): f is Extract<Node, { t: 'pow' }> => f.t === 'pow' && f.e.t === 'n' && qIs(f.e.v, -1);
      let top = fs.filter((f) => !isInv(f));
      const bottom = fs.filter(isInv).map((f) => f.b);
      let sign = '';
      if (top.length > 1 && top[0].t === 'n' && qIs(top[0].v, -1)) {
        sign = '-';
        top = top.slice(1);
      }
      if (top.length > 1) top = top.filter((f) => !(f.t === 'n' && qIs(f.v, 1)));
      let out = '';
      for (const f of top) {
        const s = tex(f, 1);
        const dot = (/\d$/.test(out) && /^[\d.]/.test(s)) || (/[A-Za-z}]$/.test(out) && /^\d/.test(s));
        out += (out && dot ? ' \\cdot ' : out ? ' ' : '') + s;
      }
      if (bottom.length) {
        // A fraction bar groups by itself: no brackets round a lone numerator or denominator.
        const num = top.length === 1 ? tex(top[0], 0) : out || '1';
        const den = bottom.length === 1 ? tex(bottom[0], 0) : bottom.map((x) => tex(x, 1)).join(' ');
        return `${sign}\\frac{${num}}{${den}}`;
      }
      return sign + out;
    }
    case 'pow': {
      if (n.e.t === 'n' && qIs(n.e.v, -1)) return `\\frac{1}{${tex(n.b, 0)}}`;
      const base = n.b.t === 'n' && !fmtQ(n.b.v).includes('/') ? tex(n.b) : n.b.t === 'v' || n.b.t === 'fn' ? tex(n.b) : paren(tex(n.b, 0));
      return `${base}^{${tex(n.e, 0)}}`;
    }
    case 'fn':
      return n.f === 'sqrt' ? `\\sqrt{${tex(n.x, 0)}}` : `\\left|${tex(n.x, 0)}\\right|`;
    case 'pm':
      return `\\pm ${tex(n.x, 1)}`;
    case 'tuple':
      return paren(n.xs.map((x) => tex(x, 0)).join(', '));
    case 'rel': {
      const op = { '=': '=', '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' }[n.op];
      return `${tex(n.l, 0)} ${op} ${tex(n.r, 0)}`;
    }
  }
}

/** How a typed answer is understood, for a live preview, or why it can't be read. */
export function readMath(input: string): { ok: true; text: string; latex: string } | { ok: false; error: string } {
  try {
    const alts = parseAll(input);
    return { ok: true, text: alts.map((a) => show(a)).join('   or   '), latex: alts.map((a) => tex(a)).join('\\quad\\text{or}\\quad ') };
  } catch (e) {
    if (e instanceof ReadError) return { ok: false, error: e.message };
    return { ok: false, error: "I can't read that." };
  }
}

/* ---------------- one simplified term ---------------- */

/**
 * true for a single simplified term: "-8x", "2x^2", "40", "x/3", "-x". false for anything with a
 * sum, a product written out ("x*(-8)", "(2x)(5)", "2·3x"), a repeated letter ("x x"), ±, or that
 * can't be read. Used where the value alone isn't enough, like the cells of an area model.
 */
export function isTerm(input: string): boolean {
  let toks: Tok[];
  let alts: Node[];
  try {
    toks = tokenize(input);
    alts = parseAll(input);
  } catch {
    return false;
  }
  if (alts.length !== 1 || toks.some((t) => t.k === 'op' && ['(', ')', '*', '±'].includes(t.v))) return false;
  let numbers = 0;
  let divisors = 0;
  const letters = new Set<string>();
  const factors = (n: Node): boolean => {
    if (n.t === 'mul') return n.xs.every(factors);
    if (n.t === 'n') {
      if (n.v.n === -1n && n.v.d === 1n) return true; // a minus sign
      numbers++;
      return true;
    }
    if (n.t === 'v' || (n.t === 'pow' && n.b.t === 'v' && n.e.t === 'n')) {
      const name = n.t === 'v' ? n.name : (n.b as { name: string }).name;
      if (letters.has(name)) return false;
      letters.add(name);
      return true;
    }
    if (n.t === 'pow' && n.b.t === 'n' && n.e.t === 'n' && n.e.v.n === -1n && n.e.v.d === 1n) {
      divisors++;
      return true;
    }
    return false;
  };
  return factors(alts[0]) && numbers <= 1 && divisors <= 1;
}
