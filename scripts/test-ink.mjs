// Ink on boards and slides (src/lib/lesson/ink.ts). Run: npm run test:ink
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { cleanStroke, parseInkOp, simplify, touches, applyInk, newStrokeId, pathD, INK_LIMITS } = await import('../src/lib/lesson/ink.ts');

const S = (id, p, c = 0, w = 1) => ({ id, c, w, p });

test('strokes from the network are checked and kept on the page', () => {
  assert.deepEqual(cleanStroke(S('abcdef01', [10.4, 20.6, 30, 40])), S('abcdef01', [10, 21, 30, 40]));
  assert.deepEqual(cleanStroke(S('abcdef01', [-500, 9999])).p, [-20, 560], 'clamped near the page');
  assert.equal(cleanStroke(S('abcdef01', [1, 2, 3])), null, 'pairs only');
  assert.equal(cleanStroke(S('abcdef01', [1, 'x'])), null);
  assert.equal(cleanStroke(S('abcdef01', [1, 2], 9)), null, 'no such color slot');
  assert.equal(cleanStroke(S('abcdef01', [1, 2], 0, 3)), null, 'no such width');
  assert.equal(cleanStroke(S('bad id!', [1, 2])), null);
  assert.equal(cleanStroke(S('abcdef01', Array(INK_LIMITS.points * 2 + 2).fill(1))), null, 'too many points');
});

test('ink messages', () => {
  assert.equal(parseInkOp({ op: 'add', page: 'b-board001', strokes: [S('abcdef01', [1, 2])] }).strokes.length, 1);
  assert.equal(parseInkOp({ op: 'add', page: 'b-board001', strokes: [] }), null);
  assert.equal(parseInkOp({ op: 'add', page: 'b-board001', strokes: [S('abcdef01', [1])] }), null, 'one bad stroke spoils the message');
  assert.deepEqual(parseInkOp({ op: 'erase', page: 'b-board001', ids: ['abcdef01'] }), { op: 'erase', page: 'b-board001', ids: ['abcdef01'] });
  assert.equal(parseInkOp({ op: 'erase', page: 'b-board001', ids: ['<script>'] }), null);
  assert.deepEqual(parseInkOp({ op: 'clear', page: 'b-board001' }), { op: 'clear', page: 'b-board001' });
  assert.equal(parseInkOp({ op: 'clear', page: '../etc' }), null, 'page ids are checked');
  assert.equal(parseInkOp({ op: 'live', page: 'b-board001', id: 'abcdef01', c: 1, w: 2, p: [5, 5, 6, 6] }).op, 'live');
  assert.equal(parseInkOp({ op: 'live', page: 'b-board001', id: 'abcdef01', c: 1, w: 2, p: Array(INK_LIMITS.livePoints * 2 + 2).fill(1) }), null);
  assert.equal(parseInkOp({ op: 'paint', page: 'b-board001' }), null);
});

test('simplify keeps the shape with fewer points', () => {
  const line = [];
  for (let x = 0; x <= 100; x++) line.push(x, 50);
  assert.deepEqual(simplify(line), [0, 50, 100, 50], 'a straight line is two points');
  const corner = [0, 0, 10, 0, 20, 0, 20, 10, 20, 20];
  assert.deepEqual(simplify(corner), [0, 0, 20, 0, 20, 20], 'the corner stays');
  const long = [];
  for (let i = 0; i < 5000; i++) long.push(i % 960, Math.round(270 + 200 * Math.sin(i / 3)));
  const s = simplify(long);
  assert.ok(s.length / 2 <= INK_LIMITS.points, 'never more than the limit');
  assert.deepEqual(s.slice(-2), long.slice(-2), 'ends where it ended');
});

test('the eraser touches strokes within its reach', () => {
  const st = S('abcdef01', [100, 100, 200, 100], 0, 1);
  assert.equal(touches(st, 150, 110), true);
  assert.equal(touches(st, 150, 140), false);
  assert.equal(touches(st, 215, 100), true, 'past the end, within reach');
  assert.equal(touches(S('abcdef02', [300, 300]), 305, 305), true, 'a dot');
});

test('applying ink: drawing order, erase, clear, no duplicates', () => {
  const a = newStrokeId(1_000);
  const b = newStrokeId(2_000);
  assert.ok(a < b, 'ids sort by when they were drawn');
  let page = applyInk([], { op: 'add', page: 'p', strokes: [S(b, [1, 1])] });
  page = applyInk(page, { op: 'add', page: 'p', strokes: [S(a, [2, 2])] });
  assert.deepEqual(page.map((x) => x.id), [a, b], 'an undone stroke goes back in its place');
  assert.equal(applyInk(page, { op: 'add', page: 'p', strokes: [S(a, [2, 2])] }), page, 'no duplicates');
  assert.deepEqual(applyInk(page, { op: 'erase', page: 'p', ids: [a] }).map((x) => x.id), [b]);
  assert.deepEqual(applyInk(page, { op: 'clear', page: 'p' }), []);
  assert.equal(pathD([5, 5]), 'M5 5l0.01 0', 'a tap draws a dot');
  assert.match(pathD([0, 0, 10, 10, 20, 0]), /^M0 0Q10 10 15 5L20 0$/);
});
