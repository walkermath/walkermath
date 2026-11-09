// src/lib/stats/dice.ts
// The dice population for the sampling-distributions app (src/components/apps/SamplingDistributions.svelte).
// The population is one roll of a die. weights[f - 1] is how much weight face f gets (whole numbers
// 0..MAX_WEIGHT): a fair die has every weight equal, and changing them loads the die, so students can
// make any population shape on 1..6. A sample is a roll of n dice. Shared math: sampling.ts.
//   npm run test:sampling

import { clampInt, statsFromCounts, type PopulationStats, type Sample } from './sampling.ts';

export const FACES = [1, 2, 3, 4, 5, 6] as const;
export const DIE_MAX_VALUE = 6;
export const MAX_WEIGHT = 9;
export const MAX_DICE = 20;
/** rolls up to this many dice are animated one die at a time */
export const ANIMATE_DICE = 5;

export const FAIR: number[] = [1, 1, 1, 1, 1, 1];

export const DIE_PRESETS: { id: string; label: string; weights: number[] }[] = [
  { id: 'fair', label: 'fair die', weights: FAIR },
  { id: 'loaded-6', label: 'loaded: 6s', weights: [1, 1, 1, 1, 1, 5] },
  { id: 'ends', label: 'only 1s and 6s', weights: [1, 0, 0, 0, 0, 1] },
  { id: 'low', label: 'mostly low', weights: [6, 5, 4, 3, 2, 1] },
];

export const clampDice = (n: number) => clampInt(n, 1, MAX_DICE);
export const clampWeight = (w: number) => clampInt(w, 0, MAX_WEIGHT);

export const dieStats = (weights: number[]): PopulationStats => statsFromCounts(weights);

/** Chance of each face, 0..1 (all 0 when every weight is 0). */
export function faceChances(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (total > 0 ? w / total : 0));
}

/** Two weightings that give the same chances are the same die (2,2,2,2,2,2 is still fair). */
export function sameDie(a: number[], b: number[]): boolean {
  const ca = faceChances(a);
  const cb = faceChances(b);
  return ca.every((x, i) => Math.abs(x - cb[i]) < 1e-12);
}

/** One die, rolled with the weights. */
export function rollDie(weights: number[], rnd: () => number = Math.random): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error('every face has weight 0');
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i + 1;
  }
  // rnd() just under 1 with rounding: the last face that has any weight
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i + 1;
  throw new Error('unreachable');
}

/** One sample: a roll of n dice. Items are the faces. */
export function rollDice(weights: number[], n: number, rnd: () => number = Math.random): Sample {
  const items: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const f = rollDie(weights, rnd);
    items.push(f);
    sum += f;
  }
  return { items, sum, mean: sum / n };
}

/** A short name: the preset's label if the chances match one, else "custom die". */
export function dieLabel(weights: number[]): string {
  for (const p of DIE_PRESETS) if (sameDie(p.weights, weights)) return p.label;
  return 'custom die';
}
