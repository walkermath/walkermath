// scripts/test-cards.mjs
// Card values, population stats, sampling with replacement, z-scores and histogram bins
// for the sampling-distribution card app (src/lib/stats/cardDeck.ts).
//   npm run test:cards

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CARDS, PRESETS, cardValue, cardLabel, cardName, isRed, clampN, meanSd, populationStats,
  drawSample, standardError, zScore, isUnusual, sumsPerBin, binCount, binOfSum, binEdges,
  binSampleMeans, normalPdf,
} from '../src/lib/stats/cardDeck.ts';

const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('card ids, labels and values: aces 1, face cards 10', () => {
  assert.equal(ALL_CARDS.length, 52);
  assert.equal(cardLabel(0), 'A♠');
  assert.equal(cardLabel(13 + 9), '10♥');
  assert.equal(cardLabel(51), 'K♣');
  assert.equal(cardName(26 + 10), 'jack of diamonds');
  assert.deepEqual([0, 1, 8, 9, 10, 11, 12].map(cardValue), [1, 2, 9, 10, 10, 10, 10]);
  assert.ok(isRed(13) && isRed(26) && !isRed(0) && !isRed(39));
});

test('full deck: μ = 340/52, σ ≈ 3.153, 16 tens', () => {
  const p = populationStats(ALL_CARDS);
  assert.equal(p.size, 52);
  close(p.mu, 340 / 52, 1e-12);
  close(p.sigma, Math.sqrt(2740 / 52 - (340 / 52) ** 2), 1e-12);
  assert.deepEqual(p.counts, [4, 4, 4, 4, 4, 4, 4, 4, 4, 16]);
});

test('presets and edge populations', () => {
  const ids = Object.fromEntries(PRESETS.map((p) => [p.id, p.cards]));
  assert.equal(ids['a-10'].length, 40);
  assert.deepEqual(populationStats(ids['a-10']).counts, new Array(10).fill(4));
  assert.equal(ids.hearts.length, 13);
  assert.equal(ids.low.length, 20);
  assert.equal(ids['aces-tens'].length, 8);
  assert.deepEqual(populationStats(ids['aces-tens']).counts, [4, 0, 0, 0, 0, 0, 0, 0, 0, 4]);
  const empty = populationStats([]);
  assert.equal(empty.size, 0);
  assert.ok(Number.isNaN(empty.mu));
  const one = populationStats([0, 13]); // two aces
  assert.equal(one.mu, 1);
  assert.equal(one.sigma, 0);
});

test('clampN keeps n in 1..50', () => {
  assert.deepEqual([0, 1, 3.4, 50, 99, NaN].map(clampN), [1, 1, 3, 50, 50, 1]);
});

test('drawSample: n cards from the population, with replacement', () => {
  const rnd = seeded(1);
  const s = drawSample([5, 18], 7, rnd);
  assert.equal(s.cards.length, 7);
  assert.ok(s.cards.every((c) => c === 5 || c === 18));
  assert.equal(s.sum, 7 * 6);
  assert.equal(s.mean, 6);
  const solo = drawSample([12], 4, rnd); // one king, drawn 4 times
  assert.deepEqual(solo.cards, [12, 12, 12, 12]);
  assert.equal(drawSample([3], 1, () => 0.9999999999).cards[0], 3);
  assert.throws(() => drawSample([], 3));
});

test('z-scores use σ/√n; null when σ = 0', () => {
  close(standardError(6, 9), 2, 1e-12);
  close(zScore(8, 5, 6, 9), 1.5, 1e-12);
  assert.equal(zScore(1, 1, 0, 3), null);
  assert.ok(isUnusual(2.01) && isUnusual(-2.5));
  assert.ok(!isUnusual(2) && !isUnusual(null));
});

test('bins: every possible sum lands in exactly one contiguous bin', () => {
  for (let n = 1; n <= 50; n++) {
    const k = sumsPerBin(n);
    const bins = binCount(n);
    const seen = new Array(bins).fill(0);
    for (let sum = n; sum <= 10 * n; sum++) {
      const b = binOfSum(sum, n);
      assert.ok(b >= 0 && b < bins, `n=${n} sum=${sum}`);
      seen[b]++;
      const { lo, hi } = binEdges(b, n);
      assert.ok(lo < sum / n && sum / n < hi, `n=${n} sum=${sum} in [${lo}, ${hi}]`);
    }
    // all bins but the last hold exactly k sums
    seen.slice(0, -1).forEach((c) => assert.equal(c, k, `n=${n}`));
    assert.ok(seen[bins - 1] >= 1 && seen[bins - 1] <= k);
    // bins touch edge to edge, from half a step below 1 to half a step above 10
    close(binEdges(0, n).lo, 1 - 0.5 / n, 1e-12);
    close(binEdges(bins - 1, n).hi, 10 + 0.5 / n, 1e-12);
    for (let i = 1; i < bins; i++) close(binEdges(i, n).lo, binEdges(i - 1, n).hi, 1e-12);
  }
  assert.equal(binCount(1), 10);
  assert.deepEqual(binEdges(6, 1), { lo: 6.5, hi: 7.5 });
});

test('simulation: mean of means ≈ μ, SD of means ≈ σ/√n, about 5% flagged (CLT at n = 30)', () => {
  const rnd = seeded(42);
  const pop = populationStats(ALL_CARDS);
  const n = 30;
  const samples = Array.from({ length: 20000 }, () => drawSample(ALL_CARDS, n, rnd));
  const { mean, sd } = meanSd(samples.map((s) => s.mean));
  close(mean, pop.mu, 0.02, 'mean of means');
  close(sd, standardError(pop.sigma, n), 0.02, 'SD of means');
  const flagged = samples.filter((s) => isUnusual(zScore(s.mean, pop.mu, pop.sigma, n))).length / samples.length;
  assert.ok(flagged > 0.035 && flagged < 0.065, `flagged ${flagged}`);
  const bins = binSampleMeans(samples, n);
  assert.equal(bins.reduce((a, b) => a + b, 0), 20000);
});

test('normal pdf integrates to about 1', () => {
  let area = 0;
  for (let x = -10; x <= 10; x += 0.001) area += normalPdf(x, 0.5, 1.3) * 0.001;
  close(area, 1, 1e-6);
});
