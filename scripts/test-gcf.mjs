// scripts/test-gcf.mjs
// factorOutTheGCF problems and checking (src/lib/gcfGen.ts).
//   npm run test:gcf

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGcf, gcfOf, generateProblem, makeProblem } from '../src/lib/gcfGen.ts';
import { checkMath } from '../src/lib/lesson/mathcheck.ts';

const T = (c, ex = 0, ey = 0) => ({ c, ex, ey });
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

test('a problem: the polynomial and its GCF pulled out', () => {
  const p = makeProblem([T(1, 1), T(2)], T(3, 1));
  assert.equal(p.text, '3x^2 + 6x');
  assert.equal(p.answer, '3x(x + 2)');
  assert.equal(p.latex, '3x^{2} + 6x');
  const q = makeProblem([T(2, 2), T(-3, 1), T(4)], T(3, 1));
  assert.equal(q.text, '6x^3 - 9x^2 + 12x');
  assert.equal(q.answer, '3x(2x^2 - 3x + 4)');
  assert.equal(makeProblem([T(1, 1), T(-5)], T(1, 1)).answer, 'x(x - 5)');
  assert.equal(makeProblem([T(2, 1), T(3, 0, 1)], T(2, 1, 1)).text, '4x^2y + 6xy^2');
});

test('generated problems: the answer multiplies back and is accepted; x comes out from level 2', () => {
  for (const level of [1, 2, 3]) {
    const rnd = seeded(level * 7);
    for (let i = 0; i < 300; i++) {
      const p = generateProblem(level, rnd);
      assert.ok(checkMath(p.text, p.answer, 'any'), `${p.text} = ${p.answer}`);
      assert.equal(checkGcf(p, p.answer).ok, true, p.answer);
      assert.ok(!p.text.startsWith('-'), 'leading term positive');
      if (level >= 2) assert.match(p.answer, /^\d*x/, `x comes out at level ${level}: ${p.answer}`);
    }
  }
});

test('checking: any order is right; equal but not greatest, unfactored or wrong says why', () => {
  const p = makeProblem([T(1, 1), T(2)], T(3, 1)); // 3x^2 + 6x
  for (const ok of ['3x(x+2)', '3x(2+x)', '(x+2)3x', '3x (x + 2)', '3x*(x+2)', '(x+2)(3x)']) assert.equal(checkGcf(p, ok).ok, true, ok);
  assert.equal(checkGcf(p, 'x(3x+6)').why, 'not-greatest');
  assert.equal(checkGcf(p, '3(x^2+2x)').why, 'not-greatest');
  assert.equal(checkGcf(p, '3x^2+6x').why, 'not-factored');
  assert.equal(checkGcf(p, '3x(x+3)').why, 'not-equal');
  assert.equal(checkGcf(p, '3x(x+').why, 'unreadable');
  assert.equal(checkGcf(p, '').why, 'unreadable');
  assert.deepEqual(gcfOf([T(6, 3), T(-9, 2), T(12, 1)]), T(3, 1));
});
