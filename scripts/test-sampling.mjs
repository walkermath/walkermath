// scripts/test-sampling.mjs
// The sampling-distributions app's math: shared stats and bins (src/lib/stats/sampling.ts),
// the card population (cardDeck.ts) and the dice population (dice.ts).
//   npm run test:sampling

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meanSd, statsFromCounts, standardError, zScore, isUnusual, sumsPerBin, binCount, binOfSum,
  binEdges, binSampleMeans, normalPdf, clampInt,
} from '../src/lib/stats/sampling.ts';
import {
  ALL_CARDS, A_TO_10, PRESETS, cardValue, cardLabel, cardName, isRed, clampN, populationStats,
  drawSample, populationLabel,
} from '../src/lib/stats/cardDeck.ts';
import {
  FAIR, DIE_PRESETS, dieStats, faceChances, sameDie, rollDie, rollDice, dieLabel, clampDice, clampWeight,
} from '../src/lib/stats/dice.ts';

const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

// ---------- shared ----------

test('statsFromCounts: μ and σ from how many of each value', () => {
  const s = statsFromCounts([1, 0, 1]); // values 1 and 3
  assert.equal(s.size, 2);
  assert.equal(s.mu, 2);
  assert.equal(s.sigma, 1);
  const e = statsFromCounts([0, 0]);
  assert.equal(e.size, 0);
  assert.ok(Number.isNaN(e.mu));
  const { mean, sd } = meanSd([1, 1, 3, 3, 3, 3]);
  const w = statsFromCounts([2, 0, 4]);
  close(w.mu, mean, 1e-12);
  close(w.sigma, sd, 1e-12);
});

test('clampInt', () => {
  assert.deepEqual([0, 1, 3.4, 50, 99, NaN].map((x) => clampInt(x, 1, 50)), [1, 1, 3, 50, 50, 1]);
});

test('z-scores use σ/√n; null when σ = 0', () => {
  close(standardError(6, 9), 2, 1e-12);
  close(zScore(8, 5, 6, 9), 1.5, 1e-12);
  assert.equal(zScore(1, 1, 0, 3), null);
  assert.ok(isUnusual(2.01) && isUnusual(-2.5));
  assert.ok(!isUnusual(2) && !isUnusual(null));
});

test('bins: every possible sum lands in exactly one contiguous bin (values 1..6 and 1..10)', () => {
  for (const max of [6, 10]) {
    for (let n = 1; n <= 50; n++) {
      const k = sumsPerBin(n);
      const bins = binCount(n, max);
      const seen = new Array(bins).fill(0);
      for (let sum = n; sum <= max * n; sum++) {
        const b = binOfSum(sum, n);
        assert.ok(b >= 0 && b < bins, `max=${max} n=${n} sum=${sum}`);
        seen[b]++;
        const { lo, hi } = binEdges(b, n, max);
        assert.ok(lo < sum / n && sum / n < hi, `max=${max} n=${n} sum=${sum} in [${lo}, ${hi}]`);
      }
      seen.slice(0, -1).forEach((c) => assert.equal(c, k, `max=${max} n=${n}`));
      assert.ok(seen[bins - 1] >= 1 && seen[bins - 1] <= k);
      close(binEdges(0, n, max).lo, 1 - 0.5 / n, 1e-12);
      close(binEdges(bins - 1, n, max).hi, max + 0.5 / n, 1e-12);
      for (let i = 1; i < bins; i++) close(binEdges(i, n, max).lo, binEdges(i - 1, n, max).hi, 1e-12);
    }
  }
  assert.equal(binCount(1, 10), 10);
  assert.equal(binCount(1, 6), 6);
  assert.equal(binCount(2, 6), 11); // sums 2..12
  assert.deepEqual(binEdges(6, 1, 10), { lo: 6.5, hi: 7.5 });
});

test('normal pdf integrates to about 1', () => {
  let area = 0;
  for (let x = -10; x <= 10; x += 0.001) area += normalPdf(x, 0.5, 1.3) * 0.001;
  close(area, 1, 1e-6);
});

// ---------- cards ----------

test('card ids, labels and values: aces 1, face cards 10', () => {
  assert.equal(ALL_CARDS.length, 52);
  assert.equal(cardLabel(0), 'A♠');
  assert.equal(cardLabel(13 + 9), '10♥');
  assert.equal(cardLabel(51), 'K♣');
  assert.equal(cardName(26 + 10), 'jack of diamonds');
  assert.deepEqual([0, 1, 8, 9, 10, 11, 12].map(cardValue), [1, 2, 9, 10, 10, 10, 10]);
  assert.ok(isRed(13) && isRed(26) && !isRed(0) && !isRed(39));
});

test('full deck: μ = 340/52, σ ≈ 3.153, 16 tens; A–10 is flat with μ = 5.5', () => {
  const p = populationStats(ALL_CARDS);
  assert.equal(p.size, 52);
  close(p.mu, 340 / 52, 1e-12);
  close(p.sigma, Math.sqrt(2740 / 52 - (340 / 52) ** 2), 1e-12);
  assert.deepEqual(p.counts, [4, 4, 4, 4, 4, 4, 4, 4, 4, 16]);
  const a10 = populationStats(A_TO_10);
  assert.equal(a10.size, 40);
  assert.equal(a10.mu, 5.5);
  close(a10.sigma, Math.sqrt(99 / 12), 1e-12);
});

test('card presets, labels and edge populations', () => {
  const ids = Object.fromEntries(PRESETS.map((p) => [p.id, p.cards]));
  assert.equal(PRESETS[0].id, 'a-10');
  assert.equal(ids.hearts.length, 13);
  assert.equal(ids.low.length, 20);
  assert.equal(ids['aces-tens'].length, 8);
  assert.deepEqual(populationStats(ids['aces-tens']).counts, [4, 0, 0, 0, 0, 0, 0, 0, 0, 4]);
  assert.equal(populationStats([]).size, 0);
  const aces = populationStats([0, 13]);
  assert.equal(aces.mu, 1);
  assert.equal(aces.sigma, 0);
  assert.equal(populationLabel(ALL_CARDS), 'full deck');
  assert.equal(populationLabel([...A_TO_10].reverse()), 'A–10');
  assert.equal(populationLabel([0, 13]), 'custom (2 cards)');
  assert.equal(populationLabel([5]), 'custom (1 card)');
  assert.deepEqual([0, 3.4, 99].map(clampN), [1, 3, 50]);
});

test('drawSample: n cards from the population, with replacement', () => {
  const rnd = seeded(1);
  const s = drawSample([5, 18], 7, rnd);
  assert.equal(s.items.length, 7);
  assert.ok(s.items.every((c) => c === 5 || c === 18));
  assert.equal(s.sum, 7 * 6);
  assert.equal(s.mean, 6);
  assert.deepEqual(drawSample([12], 4, rnd).items, [12, 12, 12, 12]);
  assert.equal(drawSample([3], 1, () => 0.9999999999).items[0], 3);
  assert.throws(() => drawSample([], 3));
});

test('cards simulation: mean of means ≈ μ, SD of means ≈ σ/√n, about 5% flagged (n = 30)', () => {
  const rnd = seeded(42);
  const pop = populationStats(ALL_CARDS);
  const n = 30;
  const samples = Array.from({ length: 20000 }, () => drawSample(ALL_CARDS, n, rnd));
  const { mean, sd } = meanSd(samples.map((s) => s.mean));
  close(mean, pop.mu, 0.02, 'mean of means');
  close(sd, standardError(pop.sigma, n), 0.02, 'SD of means');
  const flagged = samples.filter((s) => isUnusual(zScore(s.mean, pop.mu, pop.sigma, n))).length / samples.length;
  assert.ok(flagged > 0.035 && flagged < 0.065, `flagged ${flagged}`);
  assert.equal(binSampleMeans(samples, n, 10).reduce((a, b) => a + b, 0), 20000);
});

// ---------- dice ----------

test('a fair die: μ = 3.5, σ = √(35/12)', () => {
  const s = dieStats(FAIR);
  assert.equal(s.size, 6);
  assert.equal(s.mu, 3.5);
  close(s.sigma, Math.sqrt(35 / 12), 1e-12);
  assert.deepEqual(s.counts, FAIR);
});

test('loaded dice: chances, sameDie, labels', () => {
  assert.deepEqual(faceChances([1, 1, 1, 1, 1, 5]).map((c) => +c.toFixed(2)), [0.1, 0.1, 0.1, 0.1, 0.1, 0.5]);
  assert.deepEqual(faceChances([0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0]);
  assert.ok(sameDie([2, 2, 2, 2, 2, 2], FAIR));
  assert.ok(!sameDie([1, 1, 1, 1, 1, 2], FAIR));
  assert.equal(dieLabel([3, 3, 3, 3, 3, 3]), 'fair die');
  assert.equal(dieLabel([2, 0, 0, 0, 0, 2]), 'only 1s and 6s');
  assert.equal(dieLabel([1, 2, 3, 4, 5, 6]), 'custom die');
  for (const p of DIE_PRESETS) assert.equal(dieLabel(p.weights), p.label);
  const ends = dieStats([1, 0, 0, 0, 0, 1]);
  assert.equal(ends.mu, 3.5);
  assert.equal(ends.sigma, 2.5);
  assert.deepEqual([0, 2.6, 99].map(clampDice), [1, 3, 20]);
  assert.deepEqual([-1, 4, 12].map(clampWeight), [0, 4, 9]);
});

test('rollDie: faces 1..6 by weight, never a weight-0 face', () => {
  assert.equal(rollDie(FAIR, () => 0), 1);
  assert.equal(rollDie(FAIR, () => 0.9999999999), 6);
  assert.equal(rollDie([0, 0, 1, 0, 0, 0], () => 0.5), 3);
  assert.equal(rollDie([1, 0, 0, 0, 0, 0], () => 0.9999999999), 1);
  assert.throws(() => rollDie([0, 0, 0, 0, 0, 0]));
  const rnd = seeded(7);
  const tally = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 60000; i++) tally[rollDie([1, 0, 0, 0, 0, 3], rnd) - 1]++;
  assert.deepEqual(tally.slice(1, 5), [0, 0, 0, 0]);
  close(tally[5] / 60000, 0.75, 0.01, 'a 6 three times out of four');
});

test('rollDice: two fair dice sum to 7 most often (6/36); means match theory', () => {
  const rnd = seeded(3);
  const n = 2;
  const samples = Array.from({ length: 36000 }, () => rollDice(FAIR, n, rnd));
  assert.ok(samples.every((s) => s.items.length === 2 && s.sum === s.items[0] + s.items[1] && s.mean === s.sum / 2));
  const sums = new Array(13).fill(0);
  for (const s of samples) sums[s.sum]++;
  const mode = sums.indexOf(Math.max(...sums));
  assert.equal(mode, 7);
  close(sums[7] / 36000, 6 / 36, 0.01);
  const pop = dieStats(FAIR);
  const { mean, sd } = meanSd(samples.map((s) => s.mean));
  close(mean, 3.5, 0.02);
  close(sd, standardError(pop.sigma, n), 0.02);
  const bins = binSampleMeans(samples, n, 6);
  assert.equal(bins.length, 11);
  assert.equal(bins[5], sums[7]); // bin 5 holds sum 7 (x̄ = 3.5)
});
