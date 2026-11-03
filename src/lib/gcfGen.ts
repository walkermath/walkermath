// src/lib/gcfGen.ts
// Problems for factorOutTheGCF: a polynomial whose terms share a greatest common factor, and that
// factor pulled out: 3x^2 + 6x -> 3x(x + 2). Pure functions, so they can be tested.
//
// Each problem is built backwards: first the part left in the parentheses (its coefficients share
// no factor and some term has no x, so nothing more comes out), then multiplied by the GCF. The
// leading coefficient is always positive, so "the" answer is the usual one (no pulling out -1).

import { checkMath, readMath } from './lesson/mathcheck.ts';

export type GcfLevel = 1 | 2 | 3;
export const GCF_LEVELS: Record<GcfLevel, { name: string; hint: string; points: number }> = {
  1: { name: 'numbers', hint: 'a number comes out: 6x + 9', points: 3 },
  2: { name: 'with x', hint: 'x comes out too: 3x² + 6x', points: 4 },
  3: { name: 'three terms', hint: 'three terms, sometimes x and y: 6x³ - 9x² + 12x', points: 6 }
};
export const GCF_LEVEL_IDS: GcfLevel[] = [1, 2, 3];

/** c · x^ex · y^ey */
export interface Term {
  c: number;
  ex: number;
  ey: number;
}

export interface GcfProblem {
  /** the polynomial, as typed ("3x^2 + 6x") and typeset */
  text: string;
  latex: string;
  /** the GCF times what's left: what students should type, as typed and typeset */
  answer: string;
  answerLatex: string;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const pick = <T>(xs: readonly T[], rnd: () => number): T => xs[Math.floor(rnd() * xs.length)];
const int = (lo: number, hi: number, rnd: () => number) => lo + Math.floor(rnd() * (hi - lo + 1));

/** "x^2y", "3x", "-y", "7"; latex uses ^{n}. With `first`, a leading + is dropped. */
function monomial(t: { c: number; ex: number; ey: number }, latex: boolean): string {
  const pow = (v: string, e: number) => (e === 0 ? '' : e === 1 ? v : latex ? `${v}^{${e}}` : `${v}^${e}`);
  const vars = pow('x', t.ex) + pow('y', t.ey);
  const a = Math.abs(t.c);
  const coef = vars && a === 1 ? '' : String(a);
  return (t.c < 0 ? '-' : '') + coef + vars;
}

/** Terms joined with + and - signs: "2x^2 - 3x + 4". */
function poly(terms: Term[], latex: boolean): string {
  return terms
    .map((t, i) => {
      const m = monomial({ ...t, c: Math.abs(t.c) }, latex);
      if (i === 0) return t.c < 0 ? `-${m}` : m;
      return `${t.c < 0 ? ' - ' : ' + '}${m}`;
    })
    .join('');
}

/** The polynomial's GCF (positive coefficient), as a term. */
export function gcfOf(terms: Term[]): Term {
  return {
    c: terms.reduce((g, t) => gcd(g, t.c), 0),
    ex: Math.min(...terms.map((t) => t.ex)),
    ey: Math.min(...terms.map((t) => t.ey))
  };
}

/** Build a problem from the inside part and the GCF. */
export function makeProblem(inside: Term[], g: Term): GcfProblem {
  const full = inside.map((t) => ({ c: t.c * g.c, ex: t.ex + g.ex, ey: t.ey + g.ey }));
  const gText = monomial(g, false);
  const gTex = monomial(g, true);
  return {
    text: poly(full, false),
    latex: poly(full, true),
    answer: `${gText}(${poly(inside, false)})`,
    answerLatex: `${gTex}\\left(${poly(inside, true)}\\right)`
  };
}

/** Is this inside part fully factored: no shared number, and some term free of each letter? */
const leftover = (inside: Term[]) => {
  const g = gcfOf(inside);
  return g.c === 1 && g.ex === 0 && g.ey === 0;
};

/** A new problem at a level. `rnd` is Math.random by default (tests pass a seeded one). */
export function generateProblem(level: GcfLevel, rnd: () => number = Math.random): GcfProblem {
  for (let tries = 0; tries < 500; tries++) {
    let inside: Term[];
    let g: Term;
    if (level === 1) {
      // 6x + 9 -> 3(2x + 3): two terms, a number GCF
      g = { c: int(2, 9, rnd), ex: 0, ey: 0 };
      inside = [
        { c: int(1, 9, rnd), ex: 1, ey: 0 },
        { c: pick([1, -1], rnd) * int(1, 9, rnd), ex: 0, ey: 0 }
      ];
    } else if (level === 2) {
      // 3x^2 + 6x -> 3x(x + 2); sometimes just x comes out, sometimes x^2
      g = { c: pick([1, 2, 2, 3, 3, 4, 5, 6, 7, 8], rnd), ex: pick([1, 1, 1, 2, 2, 3], rnd), ey: 0 };
      inside = [
        { c: int(1, 7, rnd), ex: int(1, 2, rnd), ey: 0 },
        { c: pick([1, -1], rnd) * int(1, 9, rnd), ex: 0, ey: 0 }
      ];
    } else if (rnd() < 0.6) {
      // 6x^3 - 9x^2 + 12x -> 3x(2x^2 - 3x + 4)
      g = { c: pick([1, 2, 2, 3, 3, 4, 5, 6], rnd), ex: int(1, 3, rnd), ey: 0 };
      inside = [
        { c: int(1, 6, rnd), ex: 2, ey: 0 },
        { c: pick([1, -1], rnd) * int(1, 9, rnd), ex: 1, ey: 0 },
        { c: pick([1, -1], rnd) * int(1, 9, rnd), ex: 0, ey: 0 }
      ];
    } else {
      // 4x^2y + 6xy^2 -> 2xy(2x + 3y), or three terms in x and y
      g = { c: pick([1, 2, 3, 4, 5, 6], rnd), ex: int(1, 2, rnd), ey: int(1, 2, rnd) };
      inside =
        rnd() < 0.5
          ? [
              { c: int(1, 7, rnd), ex: 1, ey: 0 },
              { c: pick([1, -1], rnd) * int(1, 9, rnd), ex: 0, ey: 1 }
            ]
          : [
              { c: int(1, 6, rnd), ex: 2, ey: 0 },
              { c: pick([1, -1], rnd) * int(1, 9, rnd), ex: 1, ey: 1 },
              { c: pick([1, -1], rnd) * int(1, 9, rnd), ex: 0, ey: 2 }
            ];
    }
    if (!leftover(inside)) continue;
    if (g.c === 1 && g.ex === 0 && g.ey === 0) continue; // something must come out
    if (Math.max(...inside.map((t) => Math.abs(t.c * g.c))) > 72) continue; // keep the numbers friendly
    return makeProblem(inside, g);
  }
  return makeProblem(
    [
      { c: 1, ex: 1, ey: 0 },
      { c: 2, ex: 0, ey: 0 }
    ],
    { c: 3, ex: 1, ey: 0 }
  );
}

export type GcfVerdict =
  | { ok: true }
  | { ok: false; why: 'unreadable'; message: string }
  | { ok: false; why: 'not-greatest' | 'not-factored' | 'not-equal'; message: string };

/**
 * A typed answer against the problem. Right when it is the GCF times what's left, in any order
 * (3x(x + 2), (x + 2)·3x, 3x(2 + x)). Otherwise says why: it can't be read (not counted wrong),
 * it's equal but not factored with the greatest factor (x(3x + 6)), it isn't factored at all, or it
 * doesn't multiply back to the problem.
 */
export function checkGcf(p: GcfProblem, typed: string): GcfVerdict {
  const t = typed.trim();
  const read = readMath(t);
  if (!t || !read.ok) return { ok: false, why: 'unreadable', message: read.ok ? 'type an answer first.' : read.error };
  if (checkMath(p.answer, t, 'form')) return { ok: true };
  if (!checkMath(p.text, t, 'any')) return { ok: false, why: 'not-equal', message: "that doesn't multiply back to the problem." };
  if (!t.includes('(')) return { ok: false, why: 'not-factored', message: "that's equal, but nothing was factored out." };
  return { ok: false, why: 'not-greatest', message: "that's equal, but not the GREATEST common factor: more comes out." };
}
