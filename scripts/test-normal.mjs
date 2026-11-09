// scripts/test-normal.mjs
// Normal-model areas and cutoffs for the normal-areas app (src/lib/stats/normal.ts).
//   npm run test:normal

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalCdf, normalPdf, invNorm, regionArea, cutoffsForArea, percentile, ordinal } from '../src/lib/stats/normal.ts';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('Φ matches z-table values to 4 decimals (and better)', () => {
  const table = [
    [0, 0.5], [1, 0.841345], [-1, 0.158655], [1.2, 0.884930], [1.96, 0.975002], [-1.645, 0.049985],
    [2, 0.977250], [3, 0.998650], [-2.33, 0.009903], [0.5, 0.691462], [-3.49, 0.000242],
  ];
  for (const [z, p] of table) close(normalCdf(z), p, 2e-6, `Φ(${z})`);
  assert.equal(normalCdf(Infinity), 1);
  assert.equal(normalCdf(-Infinity), 0);
  for (let z = -5; z <= 5; z += 0.37) close(normalCdf(z) + normalCdf(-z), 1, 1e-12, `symmetry ${z}`);
});

test('Φ is increasing and its slope is the pdf', () => {
  let prev = -1;
  for (let z = -4; z <= 4; z += 0.01) {
    const p = normalCdf(z);
    assert.ok(p > prev);
    prev = p;
  }
  const h = 1e-4;
  for (const z of [-2, -0.5, 0, 1, 2.5]) close((normalCdf(z + h) - normalCdf(z - h)) / (2 * h), normalPdf(z), 2e-5);
});

test('invNorm: the classic cutoffs, and undoes Φ', () => {
  close(invNorm(0.975), 1.959964, 1e-5);
  close(invNorm(0.95), 1.644854, 1e-5);
  close(invNorm(0.9), 1.281552, 1e-5);
  close(invNorm(0.5), 0, 1e-9);
  close(invNorm(0.01), -2.326348, 1e-5);
  close(invNorm(0.001), -3.090232, 1e-5);
  for (let p = 0.0005; p < 1; p += 0.0123) close(normalCdf(invNorm(p)), p, 2e-7, `p=${p}`);
  assert.equal(invNorm(0), -Infinity);
  assert.equal(invNorm(1), Infinity);
  assert.ok(Number.isNaN(invNorm(1.5)));
});

test('region areas: less, greater, between, outside', () => {
  close(regionArea('left', 1.2), 0.884930, 2e-6);
  close(regionArea('right', 1.2), 0.115070, 2e-6);
  close(regionArea('between', -1, 1), 0.682689, 2e-6);
  close(regionArea('between', -2, 2), 0.954500, 2e-6);
  close(regionArea('between', -3, 3), 0.997300, 2e-6);
  close(regionArea('outside', -1.96, 1.96), 0.049996, 2e-6);
  for (const [a, b] of [[-0.7, 0.3], [0.1, 2.4]]) close(regionArea('between', a, b) + regionArea('outside', a, b), 1, 1e-12);
});

test('cutoffsForArea undoes regionArea; two-cutoff regions are symmetric', () => {
  for (const region of ['left', 'right', 'between', 'outside']) {
    for (const area of [0.01, 0.05, 0.1, 0.3333, 0.5, 0.68, 0.9, 0.95, 0.99]) {
      const c = cutoffsForArea(region, area);
      assert.ok(c, `${region} ${area}`);
      assert.ok(c.za <= c.zb);
      close(regionArea(region, c.za, c.zb), area, 5e-7, `${region} ${area}`);
      if (region === 'between' || region === 'outside') close(c.za, -c.zb, 1e-12);
    }
  }
  close(cutoffsForArea('between', 0.95).zb, 1.959964, 1e-5);
  close(cutoffsForArea('outside', 0.05).zb, 1.959964, 1e-5);
  close(cutoffsForArea('right', 0.1).za, 1.281552, 1e-5);
  assert.equal(cutoffsForArea('left', 0), null);
  assert.equal(cutoffsForArea('left', 1), null);
  assert.equal(cutoffsForArea('left', NaN), null);
});

test('percentiles and ordinals', () => {
  close(percentile(1.2), 88.493, 1e-3);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 88, 99, 101, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '88th', '99th', '101st', '111th']);
});
