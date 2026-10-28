// src/lib/splitTheMiddleGen.ts
// Round generator for SplitTheMiddle.svelte. Pure TypeScript so it can be tested on its own.
//
// Every trinomial is built forward from two binomials:
//     (a x + b)(c x + d)  =  A x² + B x + C
//     A = a·c      B = a·d + b·c      C = b·d
// The player must find the two "split" terms  b1 = a·d  and  b2 = b·c,
// which multiply to A·C and add to B. The size of |A·C| is what makes a round hard,
// so difficulty 2 caps that number directly instead of capping a, b, c, d separately.

export type Level = 1 | 2 | 3;
export const LEVEL_IDS: Level[] = [1, 2, 3];

export interface LevelConfig {
  name: string;
  blurb: string;
  example: string;
  multiplier: number;
  /** allowed (a, c) leading-coefficient pairs; one pair is chosen uniformly each round */
  pairs: [number, number][];
  /** b and d are non-zero integers in [-maxConst, maxConst] */
  maxConst: number;
  /** reject rounds where |A·C| = |a·b·c·d| exceeds this (Infinity = no cap) */
  maxProduct: number;
  /** require gcd(a,b) = gcd(c,d) = 1, so the trinomial never has a common factor to pull out first */
  primitive: boolean;
  /** chance of a difference-of-two-squares round (B = 0) */
  dotsChance: number;
}

const range = (lo: number, hi: number): number[] =>
  Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

function pairsFrom(as: number[], cs: number[], ok: (a: number, c: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (const a of as) for (const c of cs) if (ok(a, c)) out.push([a, c]);
  return out;
}

export const LEVELS: Record<Level, LevelConfig> = {
  1: {
    name: 'basic',
    blurb: 'leading coefficient is always 1. constants up to ±12.',
    example: 'x² - 5x - 24',
    multiplier: 1.0,
    pairs: [[1, 1]],
    maxConst: 12,
    maxProduct: Infinity,
    primitive: true,
    dotsChance: 0
  },
  2: {
    name: 'standard',
    blurb: 'leading coefficient 2 to 9. the number you split, A·C, never passes 150.',
    example: '6x² - 7x - 20',
    multiplier: 1.5,
    // a, c in 1..4 with 2 <= a·c <= 9  (so a=3 forces c<=3, a=4 forces c<=2)
    pairs: pairsFrom(range(1, 4), range(1, 4), (a, c) => a * c >= 2 && a * c <= 9),
    maxConst: 15,
    maxProduct: 150,
    primitive: true,
    dotsChance: 0
  },
  3: {
    name: 'crazy',
    blurb: 'no leash: negative leads, constants to ±20, difference of squares.',
    example: '-12x² + 61x - 70',
    multiplier: 2.5,
    pairs: pairsFrom([...range(-6, -1), ...range(1, 6)], [...range(-6, -1), ...range(1, 6)], () => true),
    maxConst: 20,
    maxProduct: Infinity,
    primitive: false,
    dotsChance: 0.3
  }
};

const gcd = (x: number, y: number): number => (y === 0 ? Math.abs(x) : gcd(y, x % y));
const randInt = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const randomNonZero = (min: number, max: number): number => {
  let v = 0;
  while (v === 0) v = randInt(min, max);
  return v;
};
const shuffled = <T,>(xs: T[]): T[] => xs.map(v => [Math.random(), v] as const).sort((p, q) => p[0] - q[0]).map(p => p[1]);

/** Number of answer tiles on the board. Tiles are built in pairs (see buildOptions). */
export const OPTION_COUNT = 12;

export interface Round {
  a: number; b: number; c: number; d: number;
  coeffA: number; coeffB: number; coeffC: number;
  b1: number; b2: number;
  isDOTS: boolean;
  /** OPTION_COUNT unique non-zero values: b1, b2 and the decoys, already shuffled */
  options: number[];
}

function pickFactors(cfg: LevelConfig): { a: number; b: number; c: number; d: number; isDOTS: boolean } {
  const wantDOTS = Math.random() < cfg.dotsChance;

  // Choose the leading-coefficient pair FIRST and keep it while searching for b and d, so every
  // pair is equally likely (re-picking the pair after each rejection would favor the easy ones).
  for (let pairTry = 0; pairTry < 30; pairTry++) {
    const [a, c0] = pick(cfg.pairs);

    if (wantDOTS) {
      // (ax + b)(±ax ∓ b): the two split terms are +ab and -ab, so B = 0
      const b = randInt(1, cfg.maxConst);
      const c = Math.random() < 0.3 ? -a : a;
      const d = c === a ? -b : b;
      return { a, b, c, d, isDOTS: true };
    }

    const c = c0;
    for (let tries = 0; tries < 400; tries++) {
      const b = randomNonZero(-cfg.maxConst, cfg.maxConst);
      const d = randomNonZero(-cfg.maxConst, cfg.maxConst);
      const b1 = a * d;
      const b2 = b * c;
      if (b1 === b2) continue;                 // the two split terms must be different tiles
      if (b1 + b2 === 0) continue;             // B = 0 is reserved for difference-of-squares rounds
      if (Math.abs(a * b * c * d) > cfg.maxProduct) continue;
      if (cfg.primitive && (gcd(a, b) !== 1 || gcd(c, d) !== 1)) continue;
      return { a, b, c, d, isDOTS: false };
    }
  }
  return { a: cfg.pairs[0][0], b: 2, c: cfg.pairs[0][1], d: 3, isDOTS: false }; // unreachable in practice
}

/**
 * Build the answer tiles so that neither half of the problem can be checked alone.
 *
 * A pair (x, y) is the answer only if BOTH  x + y = B  AND  x · y = A·C.
 * Old versions filled the board with random numbers, so the only two tiles that added up to B
 * were the answer and a player could skip the factoring. Now every decoy comes as a pair that
 * passes exactly one of the two tests:
 *   - sum decoys:     x + y = B but x · y is wrong   (what you get by only matching the sum)
 *   - product decoys: x · y = A·C but x + y is wrong  (sign flips, other factor pairs of A·C)
 * so a player has to find the factor pair of A·C that also adds to B.
 */
function buildOptions(b1: number, b2: number, B: number, AC: number): number[] {
  const used = new Set<number>([b1, b2]);
  const tiles: number[] = [b1, b2];

  const tryAddPair = (x: number, y: number): boolean => {
    if (tiles.length + 2 > OPTION_COUNT) return false;
    if (x === 0 || y === 0 || x === y || used.has(x) || used.has(y)) return false;
    used.add(x); used.add(y); tiles.push(x, y);
    return true;
  };

  // all signed divisors of |A·C|
  const absAC = Math.abs(AC);
  const divisors: number[] = [];
  for (let i = 1; i * i <= absAC; i++) {
    if (absAC % i === 0) {
      divisors.push(i, -i);
      if (i * i !== absAC) divisors.push(absAC / i, -absAC / i);
    }
  }
  const reach = Math.max(15, Math.round(1.6 * Math.max(Math.abs(b1), Math.abs(b2))));

  // product decoy #1: the sign-flipped answer (-b1, -b2). Skipped for B = 0 where it is the same pair.
  const signFlip = (): boolean => tryAddPair(-b1, -b2);

  // product decoys: other factor pairs (f, A·C / f)
  const factorPairs = shuffled(divisors).filter(f => Math.abs(f) <= Math.abs(AC / f));
  const otherFactorPair = (): boolean => {
    for (const f of factorPairs) if (tryAddPair(f, AC / f)) return true;
    return false;
  };

  // sum decoys: (p, B - p). Prefer p that is a real divisor of A·C so it looks like a candidate.
  const sumCandidates = [
    ...shuffled(divisors).filter(f => Math.abs(B - f) <= reach * 1.5),
    ...shuffled(Array.from({ length: 2 * reach }, (_, k) => k - reach))
  ];
  const sumDecoy = (): boolean => {
    for (const p of sumCandidates) if (tryAddPair(p, B - p)) return true;
    return false;
  };

  // two sum decoys + one sign flip + one other factor pair, then alternate until the board is full
  const plan = [signFlip, sumDecoy, otherFactorPair, sumDecoy, sumDecoy, otherFactorPair, sumDecoy, sumDecoy];
  for (const step of plan) {
    if (tiles.length >= OPTION_COUNT) break;
    step();
  }

  // last resort (tiny A·C can run out of pairs): fill with loose numbers
  let guard = 0;
  while (tiles.length < OPTION_COUNT && guard++ < 500) {
    const v = randomNonZero(-reach, reach);
    if (!used.has(v)) { used.add(v); tiles.push(v); }
  }
  return shuffled(tiles);
}

export function generateRound(level: Level): Round {
  const cfg = LEVELS[level];
  const { a, b, c, d, isDOTS } = pickFactors(cfg);
  const b1 = a * d;
  const b2 = b * c;
  const coeffA = a * c;
  const coeffB = b1 + b2;
  const coeffC = b * d;

  return {
    a, b, c, d,
    coeffA, coeffB, coeffC,
    b1, b2,
    isDOTS,
    options: buildOptions(b1, b2, coeffB, coeffA * coeffC)
  };
}