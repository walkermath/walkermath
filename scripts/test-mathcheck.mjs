// scripts/test-mathcheck.mjs
// The Math question type's checker (src/lib/lesson/mathcheck.ts).
//   npm run test:math

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMath, readMath } from '../src/lib/lesson/mathcheck.ts';

const form = (key, ans) => checkMath(key, ans, 'form');
const any = (key, ans) => checkMath(key, ans, 'any');

test('same form: terms and factors may come in any order', () => {
  assert.ok(form('(x+5)(x+2)', '(x+2)(x+5)'));
  assert.ok(form('(x+5)(x+2)', '(x + 2) * (x + 5)'));
  assert.ok(form('x^2+7x+10', '10+x^2+7x'));
  assert.ok(form('x^2+7x+10', '7*x + x² + 10'));
  assert.ok(form('3x-4', '-4+3x'));
  assert.ok(form('x(x+3)', '(x+3)x'));
  assert.ok(form('2x+3y', 'y*3+x*2'));
  assert.ok(form('x*x', 'x^2'), 'x times x is x squared');
  assert.ok(form('(x+2)^2', '(x+2)(x+2)'));
});

test('same form: nothing is expanded, factored or combined', () => {
  assert.ok(!form('(x+5)(x+2)', 'x^2+7x+10'), 'an expanded answer to a factoring question');
  assert.ok(!form('x^2+7x+10', '(x+5)(x+2)'));
  assert.ok(!form('2(x+3)', '2x+6'));
  assert.ok(!form('2x+6', '2(x+3)'));
  assert.ok(!form('x+x', '2x'));
  assert.ok(!form('3x-4', '3x+4'));
  assert.ok(!form('x-5', '5-x'));
  assert.ok(!form('(x+2)(x+5)/(x+5)', 'x+2'), 'an unreduced fraction is not the reduced one');
  assert.ok(!form('x+2', '(x+2)(x+5)/(x+5)'));
});

test('arithmetic on plain numbers is done for you', () => {
  assert.ok(form('0.5', '1/2'));
  assert.ok(form('1/2', '0.5'));
  assert.ok(form('12', '3*4'));
  assert.ok(form('x+5', '5+x'));
  assert.ok(form('x+2+3', 'x+5'));
  assert.ok(form('0.5x', 'x/2'));
  assert.ok(form('1,000', '1000'));
  assert.ok(form('4', '4.00'));
  assert.ok(!form('4', '5'));
});

test('a key written as a fraction wants that fraction', () => {
  assert.ok(form('3/4', '3/4'));
  assert.ok(form('3/4', '0.75'), 'the decimal is the same number');
  assert.ok(!form('3/4', '6/8'), 'not reduced');
  assert.ok(form('-3/4', '-3/4'));
  assert.ok(!form('-3/4', '3/4'));
  assert.ok(any('3/4', '6/8'), 'any equivalent form accepts it');
});

test('equations: both sides must match, either way round; solving is not the same as restating', () => {
  assert.ok(form('x=7', 'x = 7'));
  assert.ok(form('x=7', '7=x'));
  assert.ok(!form('x=7', 'x+5=12'), 'x + 5 = 12 is the question, not the answer');
  assert.ok(!any('x=7', 'x+5=12'), 'even when any equivalent form is allowed');
  assert.ok(!form('x=7', 'x=8'));
  assert.ok(!form('x=7', '7'), 'a key with "=" wants the equation');
  assert.ok(form('y=2x+3', '2x+3=y'));
  assert.ok(form('y=2x+3', 'y = 3 + 2x'));
  assert.ok(!form('y=2x+3', '2y=4x+6'));
  assert.ok(any('y=2x+3', 'y=3+2x'));
  assert.ok(any('y=2(x+3)', 'y=2x+6'));
});

test('a key without "=" accepts the answer written as x = answer', () => {
  assert.ok(form('7', 'x = 7'));
  assert.ok(form('7', 'x=7'));
  assert.ok(!form('7', 'x = 8'));
  assert.ok(!form('7', '2x = 7'));
  assert.ok(!form('7', '7 = x + 1'));
});

test('inequalities keep their direction', () => {
  assert.ok(form('x>3', 'x > 3'));
  assert.ok(form('x>3', '3<x'));
  assert.ok(!form('x>3', 'x<3'));
  assert.ok(!form('x>3', 'x>=3'));
  assert.ok(form('x>=3', 'x≥3'));
  assert.ok(form('x<=3', '3>=x'));
});

test('several answers match as a set; ± is two answers', () => {
  assert.ok(form('x=3 or x=-3', 'x=-3 or x=3'));
  assert.ok(form('x=3 or x=-3', 'x = ±3'));
  assert.ok(form('x=±3', 'x=3, x=-3'));
  assert.ok(form('±3', '3 or -3'));
  assert.ok(!form('x=3 or x=-3', 'x=3'));
  assert.ok(!form('x=3', 'x=3 or x=-3'));
  assert.ok(form('x=3 and x=-3', 'x=-3; x=3'));
  assert.ok(form('2±√3', '2+√3 or 2-√3'));
  assert.ok(any('x=±2√2', 'x=√8 or x=-√8'));
});

test('ordered pairs keep their order', () => {
  assert.ok(form('(2,3)', '(2, 3)'));
  assert.ok(!form('(2,3)', '(3,2)'));
  assert.ok(form('(2x,3)', '(x*2,3)'));
});

test('any equivalent form', () => {
  assert.ok(any('(x+5)(x+2)', 'x^2+7x+10'));
  assert.ok(any('x^2+7x+10', '(x+2)(x+5)'));
  assert.ok(any('2(x+3)', '2x+6'));
  assert.ok(any('x+x', '2x'));
  assert.ok(!any('(x+5)(x+2)', 'x^2+7x+11'));
  assert.ok(!any('2x+6', '2x+7'));
  assert.ok(any('(x^2-4)/(x-2)', 'x+2'));
  assert.ok(any('√8', '2√2'));
  assert.ok(!form('√8', '2√2'), 'simplified radicals matter in same-form mode');
  assert.ok(form('2√2', '2sqrt(2)'));
  assert.ok(any('x^(1/2)', 'sqrt(x)'));
  assert.ok(!any('sqrt(x^2)', 'x'));
  assert.ok(any('(a+b)^2', 'a^2+2ab+b^2'));
  assert.ok(!any('(a+b)^2', 'a^2+b^2'));
  assert.ok(any('x/2 + 1/2', '(x+1)/2'));
});

test('imaginary numbers', () => {
  assert.ok(form('3+2i', '2i+3'));
  assert.ok(!form('-1', 'i^2'), 'same form keeps i^2 as typed');
  assert.ok(any('-1', 'i^2'));
  assert.ok(any('-i', 'i^3'));
  assert.ok(any('2i', 'sqrt(-4)'));
  assert.ok(any('(3+2i)(1-i)', '5-i'));
  assert.ok(!any('(3+2i)(1-i)', '5+i'));
  assert.ok(any('1/i', '-i'));
});

test('how it is read: powers, signs and implicit multiplication', () => {
  assert.ok(form('-x^2', '-(x^2)'));
  assert.ok(!form('-x^2', '(-x)^2'));
  assert.ok(form('2^3^2', '2^9'), 'powers stack to the right');
  assert.ok(form('x^-1', '1/x'));
  assert.ok(form('3(x+1)', '(x+1)*3'));
  assert.ok(form('xy', 'y*x'));
  assert.ok(form('X+1', 'x + 1'), 'capital letters are the same letters');
  assert.ok(form('x²', 'x^2'));
  assert.ok(form('x^{2}', 'x^2'));
  assert.ok(form('2−x', '2-x'), 'a typographic minus');
  assert.ok(form('3×4', '3*4'));
  assert.ok(form('x²+x³', 'x^3+x^2'));
  assert.ok(form('π', 'pi'));
  assert.ok(form('abs(x-3)', 'abs(-3+x)'));
});

test('unreadable answers are wrong, not errors; unreadable keys fall back to the text', () => {
  assert.equal(checkMath('x+2', 'x+', 'form'), false);
  assert.equal(checkMath('x+2', '((x+2)', 'form'), false);
  assert.equal(checkMath('x+2', 'x2', 'form'), false);
  assert.equal(checkMath('x+2', '1/0', 'any'), false);
  assert.equal(checkMath('x+2', 'x+2$', 'any'), false);
  assert.equal(checkMath('x+', ' X+ ', 'form'), true, 'a broken key matches the same text');
  assert.equal(checkMath('x+2', 'x+'.repeat(300), 'form'), false);
  assert.equal(checkMath('x', '9'.repeat(70), 'any'), false);
});

test('same mark every time', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(any('(x+5)(x+2)', 'x^2+7x+10'));
    assert.ok(!any('(x+5)(x+2)', 'x^2+7x+10.0001'));
  }
});

test('readMath: the preview of how an answer was understood', () => {
  const text = (s) => {
    const r = readMath(s);
    return r.ok ? r.text : `ERR ${r.error}`;
  };
  assert.equal(text('(x+5)(x+2)'), '(x + 5)(x + 2)');
  assert.equal(text('x^2+7x+10'), 'x² + 7x + 10');
  assert.equal(text('2x-3'), '2x − 3');
  assert.equal(text('x/2'), 'x / 2');
  assert.equal(text('3/4'), '3 / 4');
  assert.equal(text('sqrt(8)'), '√8');
  assert.equal(text('2√(x+1)'), '2√(x + 1)');
  assert.equal(text('x=±3'), 'x = ±3');
  assert.equal(text('x=3 or x=-3'), 'x = 3   or   x = -3');
  assert.equal(text('0.5x'), '0.5x');
  assert.equal(text('x^(n+1)'), 'x^(n + 1)');
  assert.equal(text('(2,3)'), '(2, 3)');
  assert.equal(text('x>=3'), 'x ≥ 3');
  assert.match(text('x2'), /^ERR "x2" is unclear/);
  assert.match(text('3+'), /^ERR/);
  assert.match(text('(3+4'), /^ERR A \( is missing/);
  assert.match(text('3+4)'), /^ERR There is a \)/);
  assert.match(text('3 $ 4'), /^ERR I can't read "\$"/);
  assert.match(text(''), /^ERR Nothing/);
  assert.match(text('x'.repeat(300)), /^ERR Keep it under/);
});

test('readMath: LaTeX for the typeset preview', () => {
  const latex = (s) => {
    const r = readMath(s);
    return r.ok ? r.latex : `ERR ${r.error}`;
  };
  assert.equal(latex('(x+5)(x+2)'), '\\left(x + 5\\right) \\left(x + 2\\right)');
  assert.equal(latex('x^2+7x+10'), 'x^{2} + 7 x + 10');
  assert.equal(latex('3/4'), '\\frac{3}{4}');
  assert.equal(latex('(x+1)/(x-2)'), '\\frac{x + 1}{x - 2}');
  assert.equal(latex('2x/3'), '\\frac{2 x}{3}');
  assert.equal(latex('sqrt(8)'), '\\sqrt{8}');
  assert.equal(latex('x>=3'), 'x \\ge 3');
  assert.equal(latex('x=±3'), 'x = \\pm 3');
  assert.equal(latex('x=3 or x=-3'), 'x = 3\\quad\\text{or}\\quad x = -3');
  assert.equal(latex('2*3'), '2 \\cdot 3');
});
