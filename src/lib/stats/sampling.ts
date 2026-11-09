// src/lib/stats/sampling.ts
// Shared math for the sampling-distributions app (src/components/apps/SamplingDistributions.svelte):
// population stats from value counts, z-scores, and histogram bins for sample means.
// Values are whole numbers 1..maxValue (cards 1..10, a die 1..6).
// Populations: cardDeck.ts, dice.ts.   npm run test:sampling

/** |z| above this flags a sample mean as unusual */
export const UNUSUAL_Z = 2;

/** One sample: its items (card ids or die faces), the sum of their values, and the mean. */
export interface Sample {
  items: number[];
  /** sum of the values (an integer, so binning is exact) */
  sum: number;
  mean: number;
}

export interface PopulationStats {
  /** cards in the population, or the die's total weight */
  size: number;
  mu: number;
  sigma: number;
  /** counts[v - 1] = how many (or how much weight) have value v */
  counts: number[];
}

export const clampInt = (x: number, lo: number, hi: number) =>
  Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : lo;

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

/** μ and σ of a population given how many (or how much weight) of each value 1..counts.length. */
export function statsFromCounts(counts: number[]): PopulationStats {
  let size = 0;
  let sum = 0;
  counts.forEach((c, i) => {
    size += c;
    sum += c * (i + 1);
  });
  if (size === 0) return { size: 0, mu: NaN, sigma: NaN, counts: [...counts] };
  const mu = sum / size;
  let ss = 0;
  counts.forEach((c, i) => (ss += c * (i + 1 - mu) ** 2));
  return { size, mu, sigma: Math.sqrt(ss / size), counts: [...counts] };
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
// A sample mean is sum/n, and the sum is an integer from n to maxValue·n. Each bin holds exactly k
// consecutive sums (k = ceil(n/5), so the bin width is about 0.2 or wider), which keeps every bin
// covering the same number of possible means: no comb-shaped gaps from bins that catch 2 values
// next to bins that catch 1. For n = 1 the bins are just the values 1..maxValue.

export const sumsPerBin = (n: number) => Math.max(1, Math.ceil(n / 5));
export const binCount = (n: number, maxValue: number) => Math.ceil((maxValue * n - n + 1) / sumsPerBin(n));
export const binOfSum = (sum: number, n: number) => Math.floor((sum - n) / sumsPerBin(n));

/** Edges of bin i on the x̄ axis (half a step past the first and last sum it holds). */
export function binEdges(i: number, n: number, maxValue: number): { lo: number; hi: number } {
  const k = sumsPerBin(n);
  const first = n + i * k;
  const last = Math.min(first + k - 1, maxValue * n);
  return { lo: (first - 0.5) / n, hi: (last + 0.5) / n };
}

export function binSampleMeans(samples: { sum: number }[], n: number, maxValue: number): number[] {
  const bins = new Array(binCount(n, maxValue)).fill(0);
  for (const s of samples) bins[binOfSum(s.sum, n)]++;
  return bins;
}

export const normalPdf = (x: number, mu: number, sd: number) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
