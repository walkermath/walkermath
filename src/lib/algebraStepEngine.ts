// src/lib/algebraStepEngine.ts
// Engine for AlgebraicStepFinder.svelte (v2.0 Coliseum Engine).
// Pure TypeScript, no framework imports, so it can be unit-tested in isolation.
//
// Equation families:
//   linear  - x terms, constants, distributable groups: 3(x - 2) + 4 = 2x + 7
//   roots   - square / cube roots of x:                2√(x + 3) - 1 = 7
//   intExp  - integer exponents:                       (x - 2)² + 5 = 54
//   ratExp  - rational exponents:                      x^(2/3) = 16
//
// A game "state" is a list of branches (Eq[]). Most of the time there is one.
// Undoing an even power (x² = 49 -> x = ±7) splits it into two branches,
// and every later operation is applied to all branches at once.

import { ASF_MULTIPLIERS } from './coliseumBoards.ts';

/* ------------------------------------------------------------------ */
/* Exact rational arithmetic                                           */
/* ------------------------------------------------------------------ */

export interface Frac { n: number; d: number }

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export const fr = (n: number, d: number = 1): Frac => {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g + 0, d: d / g };
};

export const ZERO = fr(0);
export const ONE = fr(1);
export const fadd = (a: Frac, b: Frac) => fr(a.n * b.d + b.n * a.d, a.d * b.d);
export const fmul = (a: Frac, b: Frac) => fr(a.n * b.n, a.d * b.d);
export const fneg = (a: Frac) => fr(-a.n, a.d);
export const finv = (a: Frac) => fr(a.d, a.n);
export const fzero = (a: Frac) => a.n === 0;
export const feq = (a: Frac, b: Frac) => a.n === b.n && a.d === b.d;
export const fint = (a: Frac) => a.d === 1;
export const fabs = (a: Frac) => fr(Math.abs(a.n), a.d);
const fnum = (a: Frac) => a.n / a.d;

const POW_LIMIT = 1_000_000;

/** Exact non-negative integer q-th root, or null. */
function intRoot(n: number, q: number): number | null {
  if (n < 0) return null;
  if (n === 0) return 0;
  const r = Math.round(Math.pow(n, 1 / q));
  for (const cand of [r - 1, r, r + 1]) {
    if (cand >= 0 && Math.pow(cand, q) === n) return cand;
  }
  return null;
}

function intPow(n: number, p: number): number | null {
  let out = 1;
  for (let i = 0; i < p; i++) {
    out *= n;
    if (Math.abs(out) > POW_LIMIT) return null;
  }
  return out;
}

/** f^k exactly (k rational), or null when the result is not real or not rational. */
export function fracPow(f: Frac, k: Frac): Frac | null {
  const p = k.n;
  const q = k.d;
  if (p === 0) return ONE;
  if (fzero(f)) return p > 0 ? ZERO : null;
  if (f.n < 0 && q % 2 === 0) return null;
  const rootN = intRoot(Math.abs(f.n), q);
  const rootD = intRoot(f.d, q);
  if (rootN === null || rootD === null) return null;
  const sign = f.n < 0 ? -1 : 1; // q is odd here when negative
  const pa = Math.abs(p);
  const pn = intPow(sign * rootN, pa);
  const pd = intPow(rootD, pa);
  if (pn === null || pd === null) return null;
  return p > 0 ? fr(pn, pd) : fr(pd, pn);
}

/* ------------------------------------------------------------------ */
/* Equation model                                                      */
/*   side  = list of terms                                             */
/*   term  = c*x  |  constant v  |  group c(a*x + b)                   */
/*         | power c*(a*x + b)^e   (e rational, e != 1)                */
/* ------------------------------------------------------------------ */

export type Term =
  | { t: 'x'; c: Frac }
  | { t: 'n'; v: Frac }
  | { t: 'g'; c: Frac; a: Frac; b: Frac }
  | { t: 'p'; c: Frac; a: Frac; b: Frac; e: Frac };
export type Side = Term[];
export interface Eq { L: Side; R: Side }
export type State = Eq[];

export type Family = 'linear' | 'roots' | 'intExp' | 'ratExp';
export const ALL_FAMILIES: Family[] = ['linear', 'roots', 'intExp', 'ratExp'];

export type OpKind = 'add' | 'sub' | 'mul' | 'div' | 'dist' | 'pow';
export type Operand = { kind: 'num'; v: Frac } | { kind: 'x'; c: Frac };

const xTerm = (c: Frac): Term => ({ t: 'x', c });
const nTerm = (v: Frac): Term => ({ t: 'n', v });

/** Combine like terms. Order: powers, groups, then the x term, then the constant. */
export function normSide(side: Side): Side {
  let xc = ZERO;
  let nc = ZERO;
  const groups: Term[] = [];
  const powers: Extract<Term, { t: 'p' }>[] = [];

  const addGroup = (c: Frac, a: Frac, b: Frac) => {
    if (feq(c, ONE) || fzero(c) || fzero(a) || fzero(b)) {
      xc = fadd(xc, fmul(c, a));
      nc = fadd(nc, fmul(c, b));
    } else groups.push({ t: 'g', c, a, b });
  };

  for (const term of side) {
    if (term.t === 'x') xc = fadd(xc, term.c);
    else if (term.t === 'n') nc = fadd(nc, term.v);
    else if (term.t === 'g') addGroup(term.c, term.a, term.b);
    else {
      if (fzero(term.c)) continue;
      if (feq(term.e, ONE)) { addGroup(term.c, term.a, term.b); continue; }
      if (fzero(term.e)) { nc = fadd(nc, term.c); continue; }
      const same = powers.find(p => feq(p.a, term.a) && feq(p.b, term.b) && feq(p.e, term.e));
      if (same) same.c = fadd(same.c, term.c);
      else powers.push({ ...term });
    }
  }
  const out: Side = [...powers.filter(p => !fzero(p.c)), ...groups];
  if (!fzero(xc)) out.push(xTerm(xc));
  if (!fzero(nc)) out.push(nTerm(nc));
  return out;
}

const hasPower = (side: Side) => side.some(t => t.t === 'p');
const sideHasX = (side: Side) => side.some(t => t.t !== 'n');
export const stateHasPower = (state: State) => state.some(eq => hasPower(eq.L) || hasPower(eq.R));

/** Linear parts only (power terms are ignored). */
export function expandSide(side: Side): { a: Frac; b: Frac } {
  let a = ZERO;
  let b = ZERO;
  for (const t of side) {
    if (t.t === 'x') a = fadd(a, t.c);
    else if (t.t === 'n') b = fadd(b, t.v);
    else if (t.t === 'g') { a = fadd(a, fmul(t.c, t.a)); b = fadd(b, fmul(t.c, t.b)); }
  }
  return { a, b };
}

/** Real-valued power with odd roots of negatives allowed. NaN when not real. */
function realPow(base: number, e: Frac): number {
  const q = e.d;
  let root: number;
  if (base < 0) {
    if (q % 2 === 0) return NaN;
    root = -Math.pow(-base, 1 / q);
  } else root = Math.pow(base, 1 / q);
  return Math.pow(root, e.n);
}

export function evalSideNum(side: Side, x: number): number {
  let total = 0;
  for (const t of side) {
    if (t.t === 'x') total += fnum(t.c) * x;
    else if (t.t === 'n') total += fnum(t.v);
    else if (t.t === 'g') total += fnum(t.c) * (fnum(t.a) * x + fnum(t.b));
    else total += fnum(t.c) * realPow(fnum(t.a) * x + fnum(t.b), t.e);
  }
  return total;
}

export function satisfies(eq: Eq, x: number): boolean {
  const l = evalSideNum(eq.L, x);
  const r = evalSideNum(eq.R, x);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
  return Math.abs(l - r) < 1e-7 * Math.max(1, Math.abs(l), Math.abs(r));
}

const scaleSide = (side: Side, k: Frac): Side =>
  side.map((t): Term =>
    t.t === 'x' ? xTerm(fmul(t.c, k))
    : t.t === 'n' ? nTerm(fmul(t.v, k))
    : { ...t, c: fmul(t.c, k) });

const distributeSide = (side: Side): Side =>
  side.flatMap((t): Term[] =>
    t.t === 'g' ? [xTerm(fmul(t.c, t.a)), nTerm(fmul(t.c, t.b))] : [t]);

function termNumbers(t: Term): Frac[] {
  if (t.t === 'x') return [t.c];
  if (t.t === 'n') return [t.v];
  return [t.c, t.a, t.b];
}

const eqNumbers = (eq: Eq): Frac[] => [...eq.L, ...eq.R].flatMap(termNumbers);

const tooBig = (eq: Eq): boolean =>
  [...eqNumbers(eq), ...[...eq.L, ...eq.R].flatMap(t => (t.t === 'p' ? [t.e] : []))]
    .some(f => Math.abs(f.n) > 100000 || f.d > 100000);

/* ------------------------------------------------------------------ */
/* Applying operations                                                 */
/* ------------------------------------------------------------------ */

type ApplyResult = { ok: true; eqs: Eq[] } | { ok: false; error: string };

const ERR = {
  generic: '// that operation is not allowed here (or the numbers got too large).',
  noPower: '// there is no exponent or root on x to undo.',
  isolate: '// isolate the power first: get it alone on one side, with only a number on the other.',
  zeroPow: '// raising to the 0 power erases the equation.',
  evenRoot: '// that would take an even root of a negative number, which is not a real number.',
  inexact: '// that power does not give an exact result here. try a different one.',
  newEvenRoot: '// that power would put an even root on an expression that can be negative, which loses solutions. try a different one.',
  noGroups: '// nothing to distribute: there are no parentheses.',
  divZero: '// cannot divide by zero.',
  mulZero: '// multiplying by zero destroys the equation.'
};

const constOf = (s: Side): Frac | null =>
  s.length === 0 ? ZERO : s.length === 1 && s[0].t === 'n' ? s[0].v : null;

/** Raise both sides to the power k. May split into two branches (±). */
function raiseEq(eq: Eq, k: Frac): ApplyResult {
  if (fzero(k)) return { ok: false, error: ERR.zeroPow };
  if (!hasPower(eq.L) && !hasPower(eq.R)) return { ok: false, error: ERR.noPower };

  let powKey: 'L' | 'R' | null = null;
  for (const key of ['L', 'R'] as const) {
    const other = key === 'L' ? eq.R : eq.L;
    const side = eq[key];
    if (side.length === 1 && side[0].t === 'p' && constOf(other)) powKey = key;
  }
  if (!powKey) return { ok: false, error: ERR.isolate };

  const constKey = powKey === 'L' ? 'R' : 'L';
  const term = eq[powKey][0] as Extract<Term, { t: 'p' }>;
  const w = constOf(eq[constKey])!;

  if (k.d % 2 === 0 && (w.n < 0 || term.c.n < 0)) return { ok: false, error: ERR.evenRoot };
  const ck = fracPow(term.c, k);
  const wk = fracPow(w, k);
  if (!ck || !wk || fzero(ck)) return { ok: false, error: ERR.inexact };

  const newE = fmul(term.e, k);
  // (u^(2/3))^(3/4) is |u|^(1/2), not u^(1/2): an even root cannot appear where u could be negative
  if (newE.d % 2 === 0 && term.e.d % 2 === 1) return { ok: false, error: ERR.newEvenRoot };
  // u^(even/q) hides the sign of u; once the exponent's numerator is odd again, both signs return.
  const plusMinus = Math.abs(term.e.n) % 2 === 0 && Math.abs(newE.n) % 2 === 1 && !fzero(wk);

  const powSide = normSide([{ t: 'p', c: ck, a: term.a, b: term.b, e: newE }]);
  const build = (val: Frac): Eq => {
    const cs = normSide([nTerm(val)]);
    return powKey === 'L' ? { L: powSide, R: cs } : { L: cs, R: powSide };
  };
  const eqs = plusMinus ? [build(wk), build(fneg(wk))] : [build(wk)];
  if (eqs.some(tooBig)) return { ok: false, error: ERR.inexact };
  return { ok: true, eqs };
}

function applyOne(eq: Eq, op: OpKind, operand?: Operand): ApplyResult {
  if (op === 'pow') {
    if (!operand || operand.kind !== 'num') return { ok: false, error: ERR.generic };
    return raiseEq(eq, operand.v);
  }
  let next: Eq;
  if (op === 'dist') {
    next = { L: normSide(distributeSide(eq.L)), R: normSide(distributeSide(eq.R)) };
  } else if (op === 'add' || op === 'sub') {
    if (!operand) return { ok: false, error: ERR.generic };
    const sign = op === 'sub' ? -1 : 1;
    const term: Term = operand.kind === 'num'
      ? nTerm(fmul(operand.v, fr(sign)))
      : xTerm(fmul(operand.c, fr(sign)));
    next = { L: normSide([...eq.L, term]), R: normSide([...eq.R, term]) };
  } else {
    if (!operand || operand.kind !== 'num') return { ok: false, error: ERR.generic };
    if (fzero(operand.v)) return { ok: false, error: op === 'div' ? ERR.divZero : ERR.mulZero };
    const k = op === 'mul' ? operand.v : finv(operand.v);
    next = { L: normSide(scaleSide(eq.L, k)), R: normSide(scaleSide(eq.R, k)) };
  }
  return tooBig(next) ? { ok: false, error: ERR.generic } : { ok: true, eqs: [next] };
}

const eqKey = (eq: Eq) => fmtEq(eq);

export function applyToState(state: State, op: OpKind, operand?: Operand): ApplyResult {
  const out: Eq[] = [];
  const seen = new Set<string>();
  for (const eq of state) {
    const res = applyOne(eq, op, operand);
    if (!res.ok) return res;
    for (const e of res.eqs) {
      const key = eqKey(e);
      if (!seen.has(key)) { seen.add(key); out.push(e); }
    }
  }
  return { ok: true, eqs: out };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export const fmtFrac = (f: Frac): string => (f.d === 1 ? `${f.n}` : `${f.n}/${f.d}`);

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
};

/** Coefficient wrapper shared by x terms and power terms: 3x, x/2, 3x/2, 2√x, x²/3. */
const withCoef = (absC: Frac, core: string): string => {
  const num = absC.n === 1 ? '' : `${absC.n}`;
  const den = absC.d === 1 ? '' : `/${absC.d}`;
  return `${num}${core}${den}`;
};

const fmtXBody = (c: Frac): string => withCoef(fabs(c), 'x');

export const fmtXTerm = (c: Frac): string => (c.n < 0 ? '-' : '') + fmtXBody(c);

const fmtInner = (a: Frac, b: Frac): string =>
  fmtSide([xTerm(a), nTerm(b)].filter(t => (t.t === 'x' ? !fzero(t.c) : !fzero((t as any).v))));

function fmtPowerCore(a: Frac, b: Frac, e: Frac): string {
  const bare = feq(a, ONE) && fzero(b);
  const base = bare ? 'x' : `(${fmtInner(a, b)})`;
  if (feq(e, fr(1, 2))) return `√${base}`;
  if (feq(e, fr(1, 3))) return `∛${base}`;
  if (fint(e) && e.n > 1) return base + `${e.n}`.split('').map(ch => SUPERSCRIPT[ch]).join('');
  return `${base}^(${fmtFrac(e)})`;
}

function termParts(t: Term): { neg: boolean; body: string } {
  if (t.t === 'x') return { neg: t.c.n < 0, body: fmtXBody(t.c) };
  if (t.t === 'n') return { neg: t.v.n < 0, body: fmtFrac(fabs(t.v)) };
  if (t.t === 'p') return { neg: t.c.n < 0, body: withCoef(fabs(t.c), fmtPowerCore(t.a, t.b, t.e)) };
  const c = fabs(t.c);
  const coef = feq(c, ONE) ? '' : fint(c) ? `${c.n}` : `(${fmtFrac(c)})`;
  return { neg: t.c.n < 0, body: `${coef}(${fmtInner(t.a, t.b)})` };
}

export function fmtSide(side: Side): string {
  if (side.length === 0) return '0';
  let out = '';
  side.forEach((t, i) => {
    const { neg, body } = termParts(t);
    out += i === 0 ? (neg ? '-' : '') + body : (neg ? ' - ' : ' + ') + body;
  });
  return out;
}

export const fmtEq = (eq: Eq): string => `${fmtSide(eq.L)} = ${fmtSide(eq.R)}`;
export const fmtState = (state: State): string[] => state.map(fmtEq);

export const fmtOperand = (o: Operand): string => (o.kind === 'num' ? fmtFrac(o.v) : fmtXTerm(o.c));

/** Exponent tile text: ^2, ^(1/2), ^(-1). */
export const fmtExponent = (o: Operand): string => {
  if (o.kind !== 'num') return fmtOperand(o);
  const s = fmtFrac(o.v);
  return fint(o.v) && o.v.n > 0 ? `^${s}` : `^(${s})`;
};

const operandKey = (o: Operand): string =>
  o.kind === 'num' ? `n:${o.v.n}/${o.v.d}` : `x:${o.c.n}/${o.c.d}`;

export function describeOp(op: OpKind, o?: Operand): string {
  if (op === 'dist') return 'distribute';
  const v = o ? fmtOperand(o) : '?';
  if (op === 'add') return `add ${v} to both sides`;
  if (op === 'sub') return `subtract ${v} from both sides`;
  if (op === 'mul') return `multiply both sides by ${v}`;
  if (op === 'div') return `divide both sides by ${v}`;
  if (o && o.kind === 'num') {
    if (feq(o.v, fr(1, 2))) return 'take the square root of both sides (^1/2)';
    if (feq(o.v, fr(1, 3))) return 'take the cube root of both sides (^1/3)';
    if (feq(o.v, fr(2))) return 'square both sides (^2)';
    if (feq(o.v, fr(3))) return 'cube both sides (^3)';
  }
  return `raise both sides to the power ${o ? fmtExponent(o).slice(1) : '?'}`;
}

/**
 * Parse typed input: integers and exact fractions ("8/3").
 * add/subtract also accept x-terms ("2x", "-x").
 * pow accepts "^2", "^(3/2)", "(1/2)".
 */
export function parseOperand(raw: string, allowX: boolean, isExponent = false): Operand | null {
  let s = raw.replace(/\s+/g, '').toLowerCase();
  if (isExponent) s = s.replace(/^\^/, '').replace(/^\((.*)\)$/, '$1');
  if (!s) return null;
  const m = s.match(/^([+-]?)(\d+)?(?:\/(\d+))?(x)?$/);
  if (!m) return null;
  const [, sign, num, den, hasX] = m;
  if (den !== undefined && num === undefined) return null;
  if (num === undefined && !hasX) return null;
  if (hasX && !allowX) return null;
  const n = num === undefined ? 1 : parseInt(num, 10);
  const d = den === undefined ? 1 : parseInt(den, 10);
  if (d === 0 || n > 10000 || d > 10000) return null;
  const v = fr(sign === '-' ? -n : n, d);
  return hasX ? { kind: 'x', c: v } : { kind: 'num', v };
}

/* ------------------------------------------------------------------ */
/* Complexity Index + step classification                              */
/* ------------------------------------------------------------------ */

const fracPenalty = (...fs: Frac[]) => fs.filter(f => !fint(f)).length * 3;

function termWeight(t: Term): number {
  if (t.t === 'n') return 1 + fracPenalty(t.v);
  if (t.t === 'x') return 1 + fracPenalty(t.c);
  if (t.t === 'g') return 3 + fracPenalty(t.c, t.a, t.b);
  // power: base cost + exponent size + one per inner layer still to peel + coefficient still attached
  return 3
    + 0.5 * (Math.abs(t.e.n) - 1 + t.e.d - 1)
    + (t.e.n < 0 ? 3 : 0)
    + (feq(t.a, ONE) ? 0 : 1)
    + (fzero(t.b) ? 0 : 1)
    + (feq(t.c, ONE) ? 0 : 1)
    + fracPenalty(t.c, t.a, t.b);
}

const sideWeight = (side: Side): number =>
  side.length === 0 ? 1 : side.reduce((s, t) => s + termWeight(t), 0);

export function fracCount(eq: Eq): number {
  return eqNumbers(eq).filter(f => !fint(f)).length;
}

export const groupCount = (eq: Eq): number =>
  [...eq.L, ...eq.R].filter(t => t.t === 'g').length;

export const stateGroupCount = (state: State): number =>
  state.reduce((s, eq) => s + groupCount(eq), 0);

/**
 * Rough "steps from solved" score. Lower is better.
 *  - every term costs 1 (a group costs 3, a power 3+, a fraction 3 extra)
 *  - x on both sides costs 2
 *  - an isolated linear x side whose coefficient is not exactly 1 costs 1
 * Solved form `x = n` scores 2.
 */
export function complexity(eq: Eq): number {
  const xL = sideHasX(eq.L);
  const xR = sideHasX(eq.R);
  let c = sideWeight(eq.L) + sideWeight(eq.R);
  if (xL && xR) c += 2;
  else {
    const xSide = xL ? eq.L : xR ? eq.R : null;
    if (xSide && !hasPower(xSide) && !feq(expandSide(xSide).a, ONE)) c += 1;
  }
  return c;
}

const stateComplexity = (s: State) => Math.max(...s.map(complexity));
const stateFracs = (s: State) => Math.max(...s.map(fracCount));

export type StepQuality = 'optimal' | 'messy';

/** Optimal = reduces complexity without introducing new fractions. Anything else is messy. */
export function classifyStep(before: State, after: State): StepQuality {
  if (stateFracs(after) <= stateFracs(before) && stateComplexity(after) < stateComplexity(before)) return 'optimal';
  return 'messy';
}

const isBareX = (s: Side) => s.length === 1 && s[0].t === 'x' && feq(s[0].c, ONE);

/** Returns n when the equation has the form x = n (or n = x), otherwise null. */
export function solvedValue(eq: Eq): Frac | null {
  if (isBareX(eq.L)) { const v = constOf(eq.R); if (v) return v; }
  if (isBareX(eq.R)) { const v = constOf(eq.L); if (v) return v; }
  return null;
}

/** All branch values when every branch reads x = n; otherwise null. Sorted, de-duplicated. */
export function solvedValues(state: State): Frac[] | null {
  const vals: Frac[] = [];
  for (const eq of state) {
    const v = solvedValue(eq);
    if (!v) return null;
    if (!vals.some(u => feq(u, v))) vals.push(v);
  }
  return vals.sort((a, b) => fnum(a) - fnum(b));
}

export type StepResult =
  | { ok: true; next: State; quality: StepQuality; label: string }
  | { ok: false; error: string };

/** Exponent of the isolated power term in an equation (the one a raise step acts on). */
function isolatedExponent(eq: Eq): Frac | null {
  for (const key of ['L', 'R'] as const) {
    const side = eq[key];
    const other = key === 'L' ? eq.R : eq.L;
    if (side.length === 1 && side[0].t === 'p' && constOf(other)) return side[0].e;
  }
  return null;
}

/**
 * A raise step is only allowed to count as optimal when it moves the exponent
 * toward 1 without hiding a sign: the new exponent must stay positive, and
 * raising to an even power is only clean when it lands exactly on x^1
 * (√x = 3 -> x = 9). Squaring anything else can create extraneous solutions.
 */
function raiseIsClean(state: State, k: Frac): boolean {
  return state.every(eq => {
    const e = isolatedExponent(eq);
    if (!e) return false;
    const newE = fmul(e, k);
    if (newE.n <= 0) return false;
    return Math.abs(k.n) % 2 === 1 || feq(newE, ONE);
  });
}

export function evaluateStep(state: State, op: OpKind, operand?: Operand): StepResult {
  if (op === 'dist' && stateGroupCount(state) === 0) return { ok: false, error: ERR.noGroups };
  if (op === 'pow' && !stateHasPower(state)) return { ok: false, error: ERR.noPower };
  const res = applyToState(state, op, operand);
  if (!res.ok) return res;
  let quality = classifyStep(state, res.eqs);
  if (op === 'pow' && operand?.kind === 'num' && !raiseIsClean(state, operand.v)) quality = 'messy';
  return { ok: true, next: res.eqs, quality, label: describeOp(op, operand) };
}

/** Solutions of the final state that do not satisfy the original equation. */
export function extraneous(original: Eq, values: Frac[]): Frac[] {
  return values.filter(v => !satisfies(original, fnum(v)));
}

/* ------------------------------------------------------------------ */
/* Difficulty                                                          */
/* ------------------------------------------------------------------ */

// [1-step, 2-step, 3-step, 4-step, 5+ step] in percent, per level 1..10
export const STEP_DIST: number[][] = [
  [80, 20, 0, 0, 0],
  [60, 40, 0, 0, 0],
  [40, 55, 5, 0, 0],
  [20, 70, 10, 0, 0],
  [10, 55, 30, 5, 0],
  [0, 40, 45, 15, 0],
  [0, 20, 50, 25, 5],
  [0, 10, 40, 35, 15],
  [0, 0, 25, 50, 25],
  [0, 0, 10, 50, 40],
];

export const MULTIPLIERS: number[] = ASF_MULTIPLIERS;

export function rollStepCount(level: number): number {
  const dist = STEP_DIST[Math.max(1, Math.min(10, level)) - 1];
  let roll = Math.random() * 100;
  for (let i = 0; i < dist.length; i++) {
    roll -= dist[i];
    if (roll < 0) {
      if (i < 4) return i + 1;
      const extra = Math.random();
      return 5 + (extra < 0.6 ? 0 : extra < 0.9 ? 1 : 2);
    }
  }
  return 1;
}

/* ------------------------------------------------------------------ */
/* Generator: solution-first forward scramble                          */
/* ------------------------------------------------------------------ */

const rnd = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const signedRnd = (lo: number, hi: number) => (Math.random() < 0.5 ? -1 : 1) * rnd(lo, hi);

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedPick<T>(entries: [T, number][]): T | null {
  const live = entries.filter(([, w]) => w > 0);
  const total = live.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [item, w] of live) {
    r -= w;
    if (r < 0) return item;
  }
  return live[live.length - 1][0];
}

/* ---------- linear family ---------- */

type ForwardOp = 'addConst' | 'addVar' | 'mul' | 'div' | 'factor' | 'groupMul';

// a side with exactly an integer x term and an integer constant, no groups
function xnSide(side: Side): { c: Frac; v: Frac } | null {
  if (side.length !== 2 || side[0].t !== 'x' || side[1].t !== 'n') return null;
  const c = side[0].c;
  const v = side[1].v;
  return fint(c) && fint(v) ? { c, v } : null;
}

function addToBoth(eq: Eq, term: Term): Eq {
  return { L: normSide([...eq.L, term]), R: normSide([...eq.R, term]) };
}

function forwardStep(eq: Eq, root: number, level: number, isFirst: boolean): Eq | null {
  const eligibleSides = (['L', 'R'] as const).filter(k => xnSide(eq[k]));
  const divisors = [2, 3, 4, 5].filter(k => root % k === 0);
  const isInitial = isFirst && eq.L.length === 1 && eq.R.length === 1;

  const op = weightedPick<ForwardOp>([
    ['addConst', 100],
    ['mul', 60],
    ['div', isInitial && divisors.length ? (level <= 4 ? 40 : 15) : 0],
    ['addVar', level >= 3 ? 18 + 4 * level : 0],
    ['factor', level >= 4 && eligibleSides.length ? 12 + 3 * level : 0],
    ['groupMul', level >= 3 && eligibleSides.length ? 14 + 3 * level : 0],
  ]);
  if (!op) return null;

  const maxConst = level < 4 ? 9 : 12;

  switch (op) {
    case 'addConst':
      return addToBoth(eq, nTerm(fr(signedRnd(1, maxConst))));
    case 'addVar':
      return addToBoth(eq, xTerm(fr(signedRnd(1, level >= 6 ? 6 : 4))));
    case 'mul': {
      const pool = [2, 3, 4, 5, 6];
      if (level >= 8) pool.push(7);
      let k = pick(pool);
      if (level >= 6 && Math.random() < 0.15) k = -pick([2, 3, 4]);
      const kf = fr(k);
      return { L: normSide(scaleSide(eq.L, kf)), R: normSide(scaleSide(eq.R, kf)) };
    }
    case 'div': {
      const k = fr(1, pick(divisors));
      return { L: normSide(scaleSide(eq.L, k)), R: normSide(scaleSide(eq.R, k)) };
    }
    case 'factor':
    case 'groupMul': {
      const sideKey = pick(eligibleSides);
      const xn = xnSide(eq[sideKey])!;
      let base = eq;
      let c = xn.c;
      let v = xn.v;
      let k: number;
      if (op === 'groupMul') {
        k = pick([2, 3, 4, 5, 6]);
        if (level >= 7 && Math.random() < 0.12) k = -1;
        const kf = fr(k);
        base = { L: normSide(scaleSide(eq.L, kf)), R: normSide(scaleSide(eq.R, kf)) };
        // factoring k back out of the chosen side leaves the original (c, v)
      } else {
        const ks = [2, 3, 4, 5, 6].filter(m => c.n % m === 0 && v.n % m === 0);
        if (level >= 7 && Math.random() < 0.2) ks.push(-1);
        if (!ks.length) return null;
        k = pick(ks);
        c = fr(c.n / k);
        v = fr(v.n / k);
      }
      const group: Term = { t: 'g', c: fr(k), a: c, b: v };
      return { ...base, [sideKey]: [group] } as Eq;
    }
  }
  return null;
}

function withinBounds(eq: Eq): boolean {
  return eqNumbers(eq).every(f => Math.abs(f.n) <= 99 && f.d <= 12);
}

function verifyLinear(eq: Eq, root: number): boolean {
  if (!satisfies(eq, root)) return false;
  const net = fadd(expandSide(eq.L).a, fneg(expandSide(eq.R).a));
  return !fzero(net) && root !== 0;
}

function forwardChain(root: number, steps: number, level: number): Eq | null {
  let eq: Eq = { L: [xTerm(ONE)], R: [nTerm(fr(root))] };
  for (let i = 0; i < steps; i++) {
    let next: Eq | null = null;
    for (let attempt = 0; attempt < 40 && !next; attempt++) {
      const cand = forwardStep(eq, root, level, i === 0);
      if (!cand || !withinBounds(cand)) continue;
      if (cand.L.length === 0 || cand.R.length === 0) continue;
      if (complexity(cand) <= complexity(eq)) continue; // every scramble step must add real work
      next = cand;
    }
    if (!next) return null;
    eq = next;
  }
  return verifyLinear(eq, root) ? eq : null;
}

function generateLinear(level: number, steps: number): GeneratedEq | null {
  const root = pick([...Array(21).keys()].map(i => i - 10).filter(r => r !== 0));
  for (let attempt = 0; attempt < 60; attempt++) {
    const eq = forwardChain(root, steps, level);
    if (eq) return { eq, roots: [root], steps, family: 'linear' };
  }
  return null;
}

/* ---------- power families ---------- */

interface PowerSeed {
  e: Frac;     // exponent on the inner expression u
  us: number[]; // every value u can take (two when the exponent's numerator is even)
  v: number;    // u^e
}

function seedPower(family: Exclude<Family, 'linear'>, level: number): PowerSeed {
  if (family === 'roots') {
    if (Math.random() < 0.65) {
      const s = rnd(1, level < 4 ? 7 : 10);
      return { e: fr(1, 2), us: [s * s], v: s };
    }
    const s = signedRnd(1, level < 4 ? 4 : 5);
    return { e: fr(1, 3), us: [s ** 3], v: s };
  }
  if (family === 'intExp') {
    const roll = Math.random();
    if (level >= 7 && roll < 0.12) {
      const s = rnd(1, 3);
      return { e: fr(4), us: [s, -s], v: s ** 4 };
    }
    if (roll < 0.65) {
      const s = rnd(1, level < 4 ? 9 : 12);
      return { e: fr(2), us: [s, -s], v: s * s };
    }
    const s = signedRnd(1, level < 4 ? 4 : 5);
    return { e: fr(3), us: [s], v: s ** 3 };
  }
  // ratExp: u = s^q so that u^(p/q) = s^p stays an integer
  const [p, q] = weightedPick<[number, number]>([
    [[2, 3], 30],
    [[3, 2], 30],
    [[4, 3], level >= 4 ? 12 : 0],
    [[5, 2], level >= 5 ? 10 : 0],
    [[3, 4], level >= 6 ? 8 : 0],
  ])!;
  const sMax = Math.max(1, Math.floor(Math.pow(level < 5 ? 125 : 250, 1 / Math.max(p, q))));
  const s = rnd(p === 2 && q === 3 ? 2 : 1, Math.max(sMax, 2));
  const u = s ** q;
  // even numerator: u and -u give the same result (for odd q)
  const us = p % 2 === 0 ? [u, -u] : [u];
  return { e: fr(p, q), us, v: s ** p };
}

function generatePower(family: Exclude<Family, 'linear'>, level: number, steps: number): GeneratedEq | null {
  for (let attempt = 0; attempt < 120; attempt++) {
    const seed = seedPower(family, level);
    if (seed.v > 400 || seed.us.some(u => Math.abs(u) > 150)) continue;

    // split the remaining steps (after undoing the power) between the inner
    // expression (ax + b) and the outer wrapper (coefficient, constant)
    const rest = Math.max(0, Math.min(steps, 5) - 1);
    const maxInner = family === 'ratExp' ? 1 : 2;
    let inner = rest > 0 ? rnd(0, Math.min(maxInner, rest)) : 0;
    let outer = Math.min(2, rest - inner);
    if (rest - inner - outer > 0) inner = Math.min(maxInner, rest - outer);

    let a = 1;
    let b = 0;
    if (inner >= 1) b = signedRnd(1, 9);
    if (inner === 2) {
      a = pick([2, 3]);
      const okB = [...Array(19).keys()].map(i => i - 9).filter(bb => bb !== 0 && seed.us.every(u => (u - bb) % a === 0));
      if (!okB.length) continue;
      b = pick(okB);
    }
    const roots = seed.us.map(u => (u - b) / a);
    if (roots.some(r => !Number.isInteger(r) || r === 0 || Math.abs(r) > 25)) continue;
    if (new Set(roots).size !== roots.length) continue;

    // outer wrapper: c * u^e + k = c * v + k
    let c = fr(1);
    let k = 0;
    const doCoef = outer === 2 || (outer === 1 && Math.random() < 0.5);
    const doConst = outer === 2 || (outer === 1 && !doCoef);
    if (doCoef) {
      if (level >= 6 && Math.random() < 0.2 && seed.v % 2 === 0) c = fr(1, 2);
      else if (level >= 6 && Math.random() < 0.2 && seed.v % 3 === 0) c = fr(1, 3);
      else c = fr(pick(level >= 5 ? [2, 3, 4, 5, -1, -2, -3] : [2, 3, 4, 5]));
    }
    if (doConst) k = signedRnd(1, 12);

    const rhs = fadd(fmul(c, fr(seed.v)), fr(k));
    if (fzero(rhs) || Math.abs(rhs.n) > 300) continue;

    const powSide = normSide([{ t: 'p', c, a: fr(a), b: fr(b), e: seed.e }, nTerm(fr(k))]);
    const constSide = normSide([nTerm(rhs)]);
    const eq: Eq = Math.random() < 0.25 ? { L: constSide, R: powSide } : { L: powSide, R: constSide };

    if (!roots.every(r => satisfies(eq, r))) continue;
    return { eq, roots: [...roots].sort((x, y) => x - y), steps: 1 + inner + outer, family };
  }
  return null;
}

/* ---------- public generator ---------- */

export interface GeneratedEq { eq: Eq; roots: number[]; steps: number; family: Family }

export function generateEquation(level: number, families: Family[] = ['linear']): GeneratedEq {
  const pool = families.length ? families : (['linear'] as Family[]);
  for (let attempt = 0; attempt < 20; attempt++) {
    const family = pick(pool);
    const steps = rollStepCount(level);
    const g = family === 'linear' ? generateLinear(level, steps) : generatePower(family, level, steps);
    if (g) return g;
  }
  const c = rnd(1, 9);
  const root = rnd(1, 9);
  return {
    eq: { L: normSide([xTerm(ONE), nTerm(fr(c))]), R: normSide([nTerm(fr(root + c))]) },
    roots: [root],
    steps: 1,
    family: 'linear',
  };
}

/* ------------------------------------------------------------------ */
/* Operand bank (Step 2, Number Bank mode)                             */
/* ------------------------------------------------------------------ */

const numOp = (v: Frac): Operand => ({ kind: 'num', v });
const xOp = (c: Frac): Operand => ({ kind: 'x', c });

export type BankOp = 'add' | 'sub' | 'mul' | 'div' | 'pow';

function isOptimalOperand(state: State, op: BankOp, o: Operand): boolean {
  const res = evaluateStep(state, op, o);
  return res.ok && res.quality === 'optimal';
}

const EXPONENT_POOL: Frac[] = [
  fr(2), fr(3), fr(4), fr(1, 2), fr(1, 3), fr(1, 4),
  fr(3, 2), fr(2, 3), fr(4, 3), fr(3, 4), fr(5, 2), fr(2, 5), fr(-1), fr(-2), fr(-1, 2)
];

function stateNumbers(state: State): Frac[] {
  return state.flatMap(eqNumbers).filter(f => !fzero(f));
}

function stateExponents(state: State): Frac[] {
  return state.flatMap(eq => [...eq.L, ...eq.R]).flatMap(t => (t.t === 'p' ? [t.e] : []));
}

/** Operands that would be graded optimal for the chosen operation (candidates come from the equation itself). */
function optimalOperands(state: State, op: BankOp): Operand[] {
  const nums = stateNumbers(state);
  const seen = new Set<string>();
  const out: Operand[] = [];
  const consider = (o: Operand) => {
    const key = operandKey(o);
    if (seen.has(key)) return;
    seen.add(key);
    if (isOptimalOperand(state, op, o)) out.push(o);
  };
  if (op === 'add' || op === 'sub') {
    const sign = op === 'add' ? -1 : 1; // add the opposite / subtract the term itself
    for (const eq of state) {
      for (const t of [...eq.L, ...eq.R]) {
        if (t.t === 'n') consider(numOp(fmul(t.v, fr(sign))));
        if (t.t === 'x') consider(xOp(fmul(t.c, fr(sign))));
      }
    }
  } else if (op === 'pow') {
    for (const e of stateExponents(state)) consider(numOp(finv(e)));
    for (const e of EXPONENT_POOL) consider(numOp(e));
  } else {
    for (let k = -12; k <= 12; k++) if (k !== 0 && k !== 1) consider(numOp(fr(k)));
    for (const f of nums) {
      // dividing by any number in the equation (e.g. 24x = 72 -> divide by 24), or clearing a fraction
      if (op === 'div') consider(numOp(f));
      else if (!fint(f)) consider(numOp(finv(f)));
    }
  }
  return out;
}

export function buildOperandBank(state: State, op: BankOp, size = 6): Operand[] {
  // Rank every optimal operand by how simple the resulting equation is (ties: smaller magnitude,
  // positive first). The best one is ALWAYS on the board, so the natural move (x/3 = -1 -> multiply
  // by 3) can never be missing; an occasional second optimal option is picked at random.
  const rank = (o: Operand): [number, number, number] => {
    const r = evaluateStep(state, op, o);
    const mag = o.kind === 'num' ? Math.abs(fnum(o.v)) : Math.abs(fnum(o.c));
    const neg = (o.kind === 'num' ? o.v.n : o.c.n) < 0 ? 1 : 0;
    return [r.ok ? stateComplexity(r.next) : Infinity, mag, neg];
  };
  const ranked = optimalOperands(state, op)
    .map(o => ({ o, k: rank(o) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
    .map(x => x.o);
  const goodPicked: Operand[] = ranked.slice(0, 1);
  if (ranked.length > 1 && Math.random() < 0.35) goodPicked.push(pick(ranked.slice(1)));
  const taken = new Set(goodPicked.map(operandKey));
  const bank: Operand[] = [...goodPicked];
  const allowX = op === 'add' || op === 'sub';

  const tryAdd = (o: Operand) => {
    if (bank.length >= size) return;
    if (o.kind === 'num' && (fzero(o.v) || (!allowX && feq(o.v, ONE)))) return;
    if (o.kind === 'x' && (!allowX || fzero(o.c))) return;
    const key = operandKey(o);
    if (taken.has(key)) return;
    if (isOptimalOperand(state, op, o)) return; // distractors must be genuinely sub-optimal
    taken.add(key);
    bank.push(o);
  };

  if (op === 'pow') {
    // the classic slips: using the exponent itself, the wrong sign, half / double
    for (const e of shuffle(stateExponents(state))) {
      tryAdd(numOp(e));
      tryAdd(numOp(fneg(finv(e))));
      tryAdd(numOp(fmul(finv(e), fr(2))));
      tryAdd(numOp(fmul(finv(e), fr(1, 2))));
    }
    for (const e of shuffle(EXPONENT_POOL)) tryAdd(numOp(e));
    return shuffle(bank.slice(0, size));
  }

  // 1. sign-flipped versions of the right answer (the classic sign error)
  for (const o of goodPicked) tryAdd(o.kind === 'num' ? numOp(fneg(o.v)) : xOp(fneg(o.c)));

  // 2. numbers that actually appear in the equation, signed both ways
  const nums = shuffle(stateNumbers(state));
  for (const f of nums) {
    tryAdd(numOp(f));
    tryAdd(numOp(fneg(f)));
    if (bank.length >= size - 1) break;
  }

  // 3. x-terms built from the equation's coefficients (add / subtract only)
  if (allowX) {
    for (const f of shuffle(nums)) {
      tryAdd(xOp(f));
      if (bank.length >= size) break;
    }
  }

  // 4. fill with plausible small integers
  let guard = 0;
  while (bank.length < size && guard++ < 200) {
    const m = rnd(2, 12);
    tryAdd(numOp(fr(Math.random() < 0.3 ? -m : m)));
  }
  return shuffle(bank);
}