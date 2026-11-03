// scripts/test-pseudonym.mjs
// The name generator (src/lib/pseudonym.ts) and sign-in's alias normalizing (src/lib/classroom.ts).
//   npm run test:pseudonym

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADJECTIVES, BANNED_TAILS, NOUNS, TAILS, generateAlias, isValidAlias } from '../src/lib/pseudonym.ts';
import { aliasTailVariant, generatePasscode, normalizeAliasInput, normalizePasscode } from '../src/lib/classroom.ts';

test('word lists: 80 each, letters only, at most 7, no repeats, no word inside another list', () => {
  assert.equal(ADJECTIVES.length, 80);
  assert.equal(NOUNS.length, 80);
  for (const list of [ADJECTIVES, NOUNS]) {
    assert.equal(new Set(list.map((w) => w.toLowerCase())).size, list.length, 'no repeats');
    for (const w of list) assert.match(w, /^[A-Z][a-z]{1,6}$/, w);
  }
  const both = ADJECTIVES.filter((a) => NOUNS.some((n) => n.toLowerCase() === a.toLowerCase()));
  assert.deepEqual(both, []);
});

test('the original 40 words of each list are still there, in order (names already issued stay valid)', () => {
  assert.deepEqual(ADJECTIVES.slice(0, 3), ['Delta', 'Matrix', 'Vector']);
  assert.equal(ADJECTIVES[39], 'Quark');
  assert.deepEqual(NOUNS.slice(0, 3), ['Fox', 'Hawk', 'Otter']);
  assert.equal(NOUNS[39], 'Condor');
  for (const w of [...ADJECTIVES.slice(0, 40), ...NOUNS.slice(0, 40)]) assert.ok(w.length <= 6, w);
});

test('tails: 10-99 without 14, 18, 69 or 88', () => {
  assert.equal(TAILS.length, 86);
  for (const t of BANNED_TAILS) assert.ok(!TAILS.includes(t), t);
  assert.ok(TAILS.includes('67') && TAILS.includes('10') && TAILS.includes('99'));
  assert.ok(!TAILS.includes('05'));
});

test('generated names: word + word + 2 digits, at most 16 characters, all valid', () => {
  for (let i = 0; i < 3000; i++) {
    const a = generateAlias();
    assert.ok(a.length <= 16, a);
    assert.match(a, /^[A-Za-z]+\d{2}$/, a);
    assert.ok(isValidAlias(a), a);
    assert.ok(!BANNED_TAILS.some((t) => a.endsWith(t)), a);
  }
});

test('isValidAlias: new and old formats; never banned tails or other text', () => {
  assert.ok(isValidAlias('VectorFox42'));
  assert.ok(isValidAlias('EpsilonPenguin67'), 'longest words: 16 characters');
  assert.ok(isValidAlias('VectorFoxK7M2'), 'old 4-character tail still valid');
  assert.ok(isValidAlias('QuantaQuokkaZZ99'), 'old format at 16 characters');
  for (const bad of ['VectorFox69', 'VectorFox88', 'VectorFox14', 'VectorFox18', 'VectorFox05', 'VectorFox4', 'VectorFox123',
    'vectorfox42', 'VectorCat42', 'VectorFoxA7M2', 'EpsilonPenguinK7M2', '', null, 42]) {
    assert.ok(!isValidAlias(bad), String(bad));
  }
});

test('sign-in reads a typed alias: case and spaces ignored, O and l/I in the 2-digit tail fixed', () => {
  assert.equal(normalizeAliasInput(' Vector Fox 42 '), 'vectorfox42');
  assert.equal(aliasTailVariant('vectorfox4o'), 'vectorfox40');
  assert.equal(aliasTailVariant('vectorfoxl7'), 'vectorfox17');
  assert.equal(aliasTailVariant('vectorfoxio'), 'vectorfox10');
  assert.equal(aliasTailVariant('vectorfox42'), null, 'nothing to fix');
  assert.equal(aliasTailVariant('vectorfoxk7m2'), null, 'old tails are left alone');
  assert.equal(aliasTailVariant(normalizeAliasInput('VectorFoxK7ML')), null, 'an old tail ending in L is left alone');
});

test('class codes: an alias noun + 2 digits; typed any way; older 3-digit codes still read', () => {
  const nouns = new Set(NOUNS.map((n) => n.toUpperCase()));
  for (let i = 0; i < 3000; i++) {
    const c = generatePasscode();
    const m = /^([A-Z]+)(\d{2})$/.exec(c);
    assert.ok(m && nouns.has(m[1]) && TAILS.includes(m[2]), c);
    assert.equal(normalizePasscode(c), c, 'a generated code reads back as itself');
  }
  for (const typed of ['fox42', 'Fox 42', ' FOX-42 ', 'fox  42']) assert.equal(normalizePasscode(typed), 'FOX42', typed);
  assert.equal(normalizePasscode('slope 318'), 'SLOPE-318', 'older codes keep their form');
  assert.equal(normalizePasscode('Slope-318'), 'SLOPE-318');
  for (const bad of ['fox', 'fox4', 'fox4242', '42', 'vector fox 42', '', null, 7]) assert.equal(normalizePasscode(bad), '', String(bad));
});
