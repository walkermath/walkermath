// scripts/test-checklist.mjs
// The readiness checklist (src/lib/lesson/checklist.ts): cleaning items and where it shows.
//   npm run test:checklist

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKLIST, checklistMode, cleanChecklist, parseChecklist } from '../src/lib/lesson/checklist.ts';

test('items are trimmed, single-line, without blanks or repeats, and capped', () => {
  assert.deepEqual(cleanChecklist(['  Journal   out ', '', 'Journal out', 'Pencil\tready']), ['Journal out', 'Pencil ready']);
  assert.deepEqual(cleanChecklist('one\r\ntwo\n\nthree'), ['one', 'two', 'three']);
  assert.equal(cleanChecklist(Array.from({ length: 9 }, (_, i) => `item ${i}`)).length, CHECKLIST.items);
  assert.equal(cleanChecklist(['x'.repeat(200)])[0].length, CHECKLIST.chars);
  assert.deepEqual(cleanChecklist([1, null, { a: 1 }, 'ok']), ['ok']);
  assert.deepEqual(cleanChecklist(undefined), []);
});

test('stored JSON is read safely (missing before the migration, or damaged)', () => {
  assert.deepEqual(parseChecklist('["Journal out"]'), ['Journal out']);
  assert.deepEqual(parseChecklist(undefined), []);
  assert.deepEqual(parseChecklist('not json'), []);
  assert.deepEqual(parseChecklist('{"a":1}'), []);
});

test('before the lesson it blocks; once running it nudges; done or empty shows nothing', () => {
  const items = ['Journal out'];
  assert.equal(checklistMode(items, false, 'waiting'), 'block');
  assert.equal(checklistMode(items, false, 'live'), 'nudge');
  assert.equal(checklistMode(items, true, 'waiting'), null);
  assert.equal(checklistMode(items, true, 'live'), null);
  assert.equal(checklistMode([], false, 'waiting'), null);
  assert.equal(checklistMode(items, false, 'ended'), null);
});
