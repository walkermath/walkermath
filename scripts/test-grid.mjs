// scripts/test-grid.mjs
// Grid questions (src/lib/lesson/grid.ts): the table, its keys, students' answers and marking.
//   npm run test:grid

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankPositions, cleanGrid, cleanGridAnswer, gridCorrect, gridMarks, gridText, joinList, newGrid, parseList, reshape } from '../src/lib/lesson/grid.ts';
import { cleanAnswers, isCorrect } from '../src/lib/lesson/answers.ts';
import { answerText } from '../src/lib/lesson/reports.ts';

const keys = JSON.stringify(['x^2', '5x', '2x', '10']);

test('a new grid is a 2 x 2 area model with headers given and four blanks', () => {
  const g = newGrid();
  assert.equal(g.rows, 3);
  assert.deepEqual(blankPositions(g), [[1, 1], [1, 2], [2, 1], [2, 2]]);
  assert.ok(g.headerRow && g.headerCol);
});

test('cleanGrid: sizes, blanks, keys kept in order and checked; blanks never carry text', () => {
  const g = newGrid();
  g.cells[1][1].text = 'should not survive';
  const ok = cleanGrid(g, keys);
  assert.equal(typeof ok, 'object');
  assert.equal(ok.grid.cells[1][1].text, '');
  assert.deepEqual(parseList(ok.answer), ['x^2', '5x', '2x', '10']);
  assert.equal(cleanGrid(g, '').answer, '', 'no keys is fine');
  assert.deepEqual(parseList(cleanGrid(g, JSON.stringify(['x^2'])).answer), ['x^2', '', '', ''], 'missing keys are blank');
  assert.match(cleanGrid(g, JSON.stringify(['x^2', '5x+', '', ''])), /blank 2's answer can't be read/);
  assert.match(cleanGrid({ ...g, rows: 9 }, ''), /1 to 8/);
  const none = { ...g, cells: g.cells.map((row) => row.map((c) => ({ ...c, blank: false }))) };
  assert.match(cleanGrid(none, ''), /at least one blank/);
});

test('reshape: making a cell blank or given, or resizing, keeps each key with its cell', () => {
  const g = newGrid();
  let r = reshape(g, parseList(keys), { toggle: [1, 2] });
  assert.deepEqual(blankPositions(r.grid), [[1, 1], [2, 1], [2, 2]]);
  assert.deepEqual(r.keys, ['x^2', '2x', '10']);
  assert.equal(r.grid.cells[1][2].text, '5x', 'its key becomes the given value');
  r = reshape(r.grid, r.keys, { toggle: [1, 2] });
  assert.deepEqual(r.keys, ['x^2', '5x', '2x', '10'], 'and back');
  r = reshape(r.grid, r.keys, { toggle: [0, 1] });
  assert.deepEqual(r.keys, ['x', 'x^2', '5x', '2x', '10'], 'a given header becomes a blank with its value as the key');
  r = reshape(newGrid(), parseList(keys), { rows: 2 });
  assert.deepEqual(r.keys, ['x^2', '5x'], 'rows cut off take their blanks with them');
  r = reshape(newGrid(), parseList(keys), { cols: 4 });
  assert.equal(r.grid.cols, 4);
  assert.deepEqual(r.keys, ['x^2', '5x', '2x', '10']);
});

test('students: answers are a list in reading order; all empty is no answer', () => {
  assert.equal(cleanGridAnswer('', 4), '');
  assert.equal(cleanGridAnswer(JSON.stringify(['', '', '', '']), 4), '');
  assert.equal(cleanGridAnswer(JSON.stringify(['x^2', '', '2x']), 4), JSON.stringify(['x^2', '', '2x']));
  assert.equal(cleanGridAnswer(JSON.stringify(['a', 'b', 'c', 'd', 'e']), 4), null, 'more answers than blanks');
  assert.equal(cleanGridAnswer('hello', 4), null);
  assert.equal(cleanGridAnswer(JSON.stringify(['x'.repeat(101)]), 4), null);
  const spec = { kind: 'questions', questions: [{ id: 'g', kind: 'grid', text: 'Area model', choices: [], grid: newGrid() }] };
  assert.deepEqual(cleanAnswers(spec, { g: JSON.stringify(['x^2', '5x', '', '']) }), { g: JSON.stringify(['x^2', '5x', '', '']) });
  assert.equal(cleanAnswers(spec, { g: '[1,2' }), 'Invalid answers.');
});

test('marking: each blank by the math checker; the question is right when every keyed blank is', () => {
  const all = JSON.stringify(['x²', 'x*5', '2x', '10']);
  assert.deepEqual(gridMarks(keys, all), [true, true, true, true]);
  assert.equal(gridCorrect(keys, all), true);
  const one = JSON.stringify(['x^2', '5x', '2x', '11']);
  assert.deepEqual(gridMarks(keys, one), [true, true, true, false]);
  assert.equal(gridCorrect(keys, one), false);
  const part = JSON.stringify(['x^2', '5x', '', '']);
  assert.equal(gridCorrect(keys, part), false, 'an empty keyed blank is not right');
  assert.deepEqual(gridMarks(keys, part), [true, true, null, null]);
  assert.equal(gridCorrect(keys, ''), null, 'nothing handed in');
  assert.equal(gridCorrect('', all), null, 'no keys');
  assert.equal(gridCorrect(JSON.stringify(['', '', '', '10']), all), true, 'only keyed blanks count');
  assert.equal(isCorrect({ kind: 'grid', answer: keys, match: 'form' }, all), true);
  assert.equal(isCorrect({ kind: 'grid', answer: JSON.stringify(['(x+5)(x+2)']), match: 'form' }, JSON.stringify(['x^2+7x+10'])), false);
  assert.equal(isCorrect({ kind: 'grid', answer: JSON.stringify(['(x+5)(x+2)']), match: 'any' }, JSON.stringify(['x^2+7x+10'])), true);
});

test('as text: "x² | 5x | _ | 10" for the answers table and reports', () => {
  assert.equal(gridText(JSON.stringify(['x^2', '5x', '', '10'])), 'x^2 | 5x | _ | 10');
  assert.equal(gridText(''), '');
  assert.equal(answerText({ kind: 'grid', choices: [] }, JSON.stringify(['x^2', '5x'])), 'x^2 | 5x');
  assert.equal(joinList(['', ' ']), '');
});
