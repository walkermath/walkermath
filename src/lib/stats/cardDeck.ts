// src/lib/stats/cardDeck.ts
// Math for the sampling-distribution card app (src/components/apps/SamplingCards.svelte).
// A card is an id 0..51: suit = floor(id / 13) in ♠ ♥ ♦ ♣ order, rank = id % 13 in A..K order.
// Card value: ace 1, number cards their number, J/Q/K 10.
// Samples are drawn WITH replacement, so draws are independent and SE = σ/√n holds exactly
// (no finite-population correction).
//   npm run test:cards

export type CardId = number;

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const RANK_NAMES = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

export const MIN_VALUE = 1;
export const MAX_VALUE = 10;
export const MIN_N = 1;
export const MAX_N = 50;
/** |z| above this flags a sample mean as unusual */
export const UNUSUAL_Z = 2;

export const ALL_CARDS: CardId[] = Array.from({ length: 52 }, (_, i) => i);

export const suitOf = (id: CardId) => Math.floor(id / 13);
export const rankOf = (id: CardId) => id % 13;
export const cardValue = (id: CardId) => Math.min(rankOf(id) + 1, MAX_VALUE);
export const cardLabel = (id: CardId) => `${RANKS[rankOf(id)]}${SUITS[suitOf(id)]}`;
export const cardName = (id: CardId) => `${RANK_NAMES[rankOf(id)]} of ${SUIT_NAMES[suitOf(id)]}`;
export const isRed = (id: CardId) => suitOf(id) === 1 || suitOf(id) === 2;

/** A through 10 in every suit (no face cards): 4 cards of each value 1..10, a flat population. The default. */
export const A_TO_10: CardId[] = ALL_CARDS.filter((c) => rankOf(c) <= 9);

/** Starting populations a student (or later, a lesson) can pick. */
export const PRESETS: { id: string; label: string; cards: CardId[] }[] = [
  { id: 'a-10', label: 'A–10', cards: A_TO_10 },
  { id: 'deck', label: 'full deck', cards: ALL_CARDS },
  { id: 'hearts', label: 'only ♥', cards: ALL_CARDS.filter((c) => suitOf(c) === 1) },
  { id: 'low', label: 'A–5 only', cards: ALL_CARDS.filter((c) => rankOf(c) <= 4) },
  { id: 'aces-tens', label: 'aces + 10s', cards: ALL_CARDS.filter((c) => cardValue(c) === 1 || rankOf(c) === 9) },
  { id: 'none', label: 'clear', cards: [] },
];

export const clampN = (n: number) =>
  Number.isFinite(n) ? Math.min(MAX_N, Math.max(MIN_N, Math.round(n))) : MIN_N;

/** Mean and standard deviation (divide by the count: a population, or the whole set of simulated means). */
export function meanSd(values: number[]): { mean: number; sd: number } {
  const count = values.length;
  if (count === 0) return { mean: NaN, sd: NaN };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / count;
  let ss = 0;
  for (const v of values) ss += (v - mean) ** 2;
  return { mean, sd: Math.sqrt(ss / count) };
}

export interface PopulationStats {
  size: number;
  mu: number;
  sigma: number;
  /** counts[v - 1] = number of cards with value v, v = 1..10 */
  counts: number[];
}

export function populationStats(cards: CardId[]): PopulationStats {
  const counts = new Array(MAX_VALUE).fill(0);
  for (const c of cards) counts[cardValue(c) - 1]++;
  const { mean, sd } = meanSd(cards.map(cardValue));
  return { size: cards.length, mu: mean, sigma: sd, counts };
}

export interface Sample {
  cards: CardId[];
  /** sum of card values (an integer, so binning is exact) */
  sum: number;
  mean: number;
}

/** One sample of n cards drawn with replacement. */
export function drawSample(population: CardId[], n: number, rnd: () => number = Math.random): Sample {
  if (population.length === 0) throw new Error('empty population');
  const cards: CardId[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const c = population[Math.min(population.length - 1, Math.floor(rnd() * population.length))];
    cards.push(c);
    sum += cardValue(c);
  }
  return { cards, sum, mean: sum / n };
}

/** Standard error of x̄ from the population: σ/√n. */
export const standardError = (sigma: number, n: number) => sigma / Math.sqrt(n);

/** z of a sample mean against the theoretical sampling distribution; null when σ = 0. */
export function zScore(xbar: number, mu: number, sigma: number, n: number): number | null {
  const se = standardError(sigma, n);
  if (!(se > 0)) return null;
  return (xbar - mu) / se;
}

export const isUnusual = (z: number | null) => z !== null && Math.abs(z) > UNUSUAL_Z;

// ---- Histogram bins for sample means ----
// A sample mean is sum/n, and the sum is an integer from n to 10n. Each bin holds exactly k
// consecutive sums (k = ceil(n/5), so the bin width is about 0.2 or wider), which keeps every bin
// covering the same number of possible means: no comb-shaped gaps from bins that catch 2 values
// next to bins that catch 1. For n = 1 the bins are just the card values 1..10.

export const sumsPerBin = (n: number) => Math.max(1, Math.ceil(n / 5));
export const binCount = (n: number) => Math.ceil((MAX_VALUE * n - MIN_VALUE * n + 1) / sumsPerBin(n));
export const binOfSum = (sum: number, n: number) => Math.floor((sum - MIN_VALUE * n) / sumsPerBin(n));

/** Edges of bin i on the x̄ axis (half a step past the first and last sum it holds). */
export function binEdges(i: number, n: number): { lo: number; hi: number } {
  const k = sumsPerBin(n);
  const first = MIN_VALUE * n + i * k;
  const last = Math.min(first + k - 1, MAX_VALUE * n);
  return { lo: (first - 0.5) / n, hi: (last + 0.5) / n };
}

export function binSampleMeans(samples: { sum: number }[], n: number): number[] {
  const bins = new Array(binCount(n)).fill(0);
  for (const s of samples) bins[binOfSum(s.sum, n)]++;
  return bins;
}

export const normalPdf = (x: number, mu: number, sd: number) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** A short name for a population: its preset's label if it matches one, else "custom (k cards)". */
export function populationLabel(cards: CardId[]): string {
  const set = new Set(cards);
  for (const p of PRESETS) {
    if (p.cards.length > 0 && p.cards.length === set.size && p.cards.every((c) => set.has(c))) return p.label;
  }
  return `custom (${set.size} ${set.size === 1 ? 'card' : 'cards'})`;
}
