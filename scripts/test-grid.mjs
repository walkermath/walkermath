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

// x² - 13x + 40 as the teacher drew it: x | -8 across the top, x | -5 down the side.
const G = (text) => ({ text, blank: false });
const B = (group) => ({ text: '', blank: true, ...(group ? { group } : {}) });

test('any-order groups: blanks with the same letter pair up with their keys in any order', () => {
  const raw = { rows: 3, cols: 3, headerRow: true, headerCol: true, cells: [[G('×'), G('$x$'), B('A')], [G('$x$'), B(), B('B')], [B('A'), B('B'), B()]] };
  // blanks in reading order: (0,2) A, (1,1), (1,2) B, (2,0) A, (2,1) B, (2,2)
  const made = cleanGrid(raw, JSON.stringify(['-8', 'x^2', '-8x', '-5', '-5x', '40']));
  assert.equal(typeof made, 'object');
  const { grid, answer } = made;
  assert.deepEqual(grid.cells[0][2], { text: '', blank: true, group: 'A' });
  assert.equal(cleanGrid({ ...raw, cells: [[G('×'), G('x'), { ...B(), group: 'Z' }], ...raw.cells.slice(1)] }, answer).grid.cells[0][2].group, undefined, 'only A-F');
  const as = (...v) => JSON.stringify(v);
  assert.equal(gridCorrect(answer, as('-8', 'x^2', '-8x', '-5', '-5x', '40'), 'form', grid), true, 'as keyed');
  assert.equal(gridCorrect(answer, as('-5', 'x^2', '-5x', '-8', '-8x', '40'), 'form', grid), true, 'factors the other way round');
  assert.equal(gridCorrect(answer, as('-8', 'x^2', '-8x', '-8', '-8x', '40'), 'form', grid), false, 'each key used once');
  assert.equal(gridCorrect(answer, as('-8', 'x^2', '-8x', '-5', '', '40'), 'form', grid), false, 'a grouped blank left empty');
  assert.equal(gridCorrect(answer, as('-8', 'x^2', '-8x', '-5', '-5x', '41'), 'form', grid), false, 'blanks on their own still count');
  assert.equal(gridCorrect(answer, as('-5', 'x^2', '-5x', '-8', '-8x', '40'), 'form'), false, 'without the grid, no groups');
  assert.deepEqual(gridMarks(answer, as('-5', 'x^2', '-5x', '-8', '-3x', '40'), 'form', grid), [true, true, true, true, false, true]);
  assert.equal(isCorrect({ kind: 'grid', answer, match: 'form', grid }, as('-5', 'x^2', '-5x', '-8', '-8x', '40')), true);
});

test('area model: one key; any correct arrangement; cells must be single simplified terms', () => {
  const blankAll = { rows: 3, cols: 3, check: 'area', cells: [[G('×'), B(), B()], [B(), B(), B()], [B(), B(), B()]] };
  const made = cleanGrid(blankAll, JSON.stringify(['(2x-3)(x+5)']));
  assert.equal(typeof made, 'object');
  const { grid, answer } = made;
  assert.ok(grid.headerRow && grid.headerCol && grid.check === 'area');
  assert.equal(answer, JSON.stringify(['(2x-3)(x+5)']));
  // reading order: top headers, then each row: side header, cells
  const as = (...v) => JSON.stringify(v);
  const ok = (v, msg) => assert.equal(gridCorrect(answer, as(...v), 'form', grid), true, msg);
  const no = (v, msg) => assert.equal(gridCorrect(answer, as(...v), 'form', grid), false, msg);
  ok(['2x', '-3', 'x', '2x^2', '-3x', '5', '10x', '-15'], '2x - 3 across the top');
  ok(['x', '5', '2x', '2x^2', '10x', '-3', '-3x', '-15'], 'x + 5 across the top');
  ok(['-3', '2x', '5', '-15', '10x', 'x', '-3x', '2x^2'], 'numbers first');
  no(['x', '-3', '2x', '2x^2', '-6x', '5', '5x', '-15'], '(x - 3)(2x + 5): consistent cells, wrong product');
  no(['2x', '-3', 'x', '2x^2', '-3x', '5', '10x', '-16'], 'a cell that is not row times column');
  no(['2x', '-3', 'x', '2x*x', '-3x', '5', '10x', '-15'], 'not simplified');
  no(['2x', '-3', 'x', '2x^2', '-3x', '5', '10x', ''], 'a blank left empty');
  assert.equal(gridCorrect(answer, '', 'form', grid), null);
  assert.equal(isCorrect({ kind: 'grid', answer, match: 'form', grid }, as('x', '5', '2x', '2x^2', '10x', '-3', '-3x', '-15')), true);
  assert.deepEqual(gridMarks(answer, as('x', '5', '2x', '2x^2', '11x', '-3', '-3x', '-15'), 'form', grid), [null, null, null, true, false, null, true, true]);

  // The teacher's own: headers given, cells blank; and an expanded key.
  const given = cleanGrid({ rows: 3, cols: 3, check: 'area', cells: [[G('×'), G('$x$'), G('$-8$')], [G('$x$'), B(), B()], [G('$-5$'), B(), B()]] }, JSON.stringify(['x^2-13x+40']));
  assert.equal(gridCorrect(given.answer, as('x^2', '-8x', '-5x', '40'), 'form', given.grid), true);
  assert.equal(gridCorrect(given.answer, as('x^2', '-5x', '-8x', '40'), 'form', given.grid), false, 'cells must match their own row and column');

  assert.match(cleanGrid({ ...blankAll }, ''), /needs a key/);
  assert.match(cleanGrid({ ...blankAll, cells: [[B(), B(), B()], ...blankAll.cells.slice(1)] }, answer), /corner/);
  assert.match(cleanGrid({ rows: 3, cols: 3, check: 'area', cells: [[G('×'), G(''), B()], ...blankAll.cells.slice(1)] }, answer), /needs a value or a blank/);
  assert.match(cleanGrid({ rows: 1, cols: 3, check: 'area', cells: [[G('×'), B(), B()]] }, answer), /at least 2 rows/);
  assert.equal(cleanGrid({ ...blankAll, cells: [[G('×'), B('A'), B()], ...blankAll.cells.slice(1)] }, answer).grid.cells[0][1].group, undefined, 'no groups in an area model');
});
