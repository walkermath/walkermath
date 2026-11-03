// scripts/test-reports.mjs
// Reports (src/lib/lesson/reports.ts): what a lesson can report, and the sheets a report makes.
//   npm run test:reports

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, reportItems, sheetName } from '../src/lib/lesson/reports.ts';

const bell = {
  id: 'm-bell',
  type: 'prompt',
  title: 'Bellwork',
  config: {
    category: 'bellwork',
    questions: [
      { id: 'q1', kind: 'number', text: 'What is 3 + 4?', choices: [], answer: '7' },
      { id: 'q2', kind: 'choice', text: 'Which is prime?', choices: ['4', '6', '7'], answer: '2' },
      { id: 'q3', kind: 'text', text: 'Explain your thinking', choices: [], answer: '' }
    ]
  }
};
const notes = { id: 'm-notes', type: 'notes', title: 'Notes', config: {} };
const talk = { id: 'm-talk', type: 'activity', title: 'Turn & Talk', config: {} };
const game = { id: 'm-game', type: 'activity', title: 'Coliseum Practice', config: { category: 'coliseum', coliseumId: 'gcd-racer' } };
const exit = { id: 'm-exit', type: 'independent', title: 'Exit Ticket', config: { category: 'exit-ticket', response: 'short' } };
const modules = [bell, notes, talk, game, exit];

const run = (id, classId, className, period, date = '2026-11-02') => ({
  id, lessonId: 'L1', lessonTitle: '4-12 Imaginary Numbers', classId, className, period, date, startTime: '09:00', modules
});

const data = {
  runs: [run('r3', 'c3', 'Honors Algebra II', 'P3'), run('r4', 'c4', 'Honors Algebra II', 'P4')],
  aliases: [
    { id: 'a1', classId: 'c3', alias: 'VectorFox42', retired: false },
    { id: 'a2', classId: 'c3', alias: 'AlphaOwl17', retired: false },
    { id: 'a3', classId: 'c3', alias: 'BetaYak20', retired: true }, // retired, took no part: left out
    { id: 'a4', classId: 'c4', alias: 'DeltaLynx33', retired: false },
    { id: 'a5', classId: 'c9', alias: 'OtherClass55', retired: false } // not in the report
  ],
  submissions: [
    { runId: 'r3', moduleId: 'm-bell', aliasId: 'a1', answers: { q1: '7', q2: '2', q3: 'added' } },
    { runId: 'r3', moduleId: 'm-bell', aliasId: 'a2', answers: { q1: '12', q2: '0' } },
    { runId: 'r3', moduleId: 'm-exit', aliasId: 'a1', answers: { short: '=SUM(A1)' } },
    { runId: 'r4', moduleId: 'm-bell', aliasId: 'a4', answers: { q1: '12', q2: '2' } }
  ],
  scores: [{ runId: 'r3', moduleId: 'm-game', aliasId: 'a2', best: 21, plays: 3 }],
  joins: [
    { runId: 'r3', aliasId: 'a1', joinedAt: Date.UTC(2026, 10, 2, 15, 2) },
    { runId: 'r3', aliasId: 'a2', joinedAt: Date.UTC(2026, 10, 2, 15, 9) }
  ]
};

const allItems = reportItems(modules).filter((i) => i.available).map((i) => i.key);
const req = (over = {}) => ({ runIds: ['r3', 'r4'], items: { L1: allItems }, breakdown: 'aggregate', questions: [], timeZone: 'America/Chicago', ...over });

test('items: each module reports what it collects; Joined, bellwork, exit ticket first; nothing for a module that collects nothing', () => {
  const items = reportItems(modules);
  assert.deepEqual(items.map((i) => i.label), [
    'Joined',
    'Bellwork · Responses',
    'Bellwork · Results',
    'Exit Ticket · Responses',
    'Coliseum Practice · Coliseum'
  ]);
  // Bellwork and exit ticket come first wherever they sit in the lesson.
  assert.deepEqual(reportItems([game, exit, bell]).map((i) => i.module), ['', 'Bellwork', 'Bellwork', 'Exit Ticket', 'Coliseum Practice']);
  // An empty bellwork (no questions yet) has nothing to report.
  assert.deepEqual(reportItems([{ ...bell, config: { category: 'bellwork', questions: [] } }]).map((i) => i.label), ['Joined']);
  // An activity that starts collecting answers joins in by itself.
  const tap = reportItems([{ ...talk, config: { doneTap: true } }]);
  assert.deepEqual(tap.map((i) => i.label), ['Joined', 'Turn & Talk · Responses']);
});

test('aggregate: one sheet, every student of both periods, blank where nothing was handed in', () => {
  const [sheet, ...rest] = buildReport(data, req());
  assert.equal(rest.length, 0);
  assert.equal(sheet.name, 'All');
  assert.deepEqual(sheet.columns.slice(0, 4), ['Class', 'Period', 'Alias', '4-12 Imaginary Numbers · Joined']);
  assert.ok(sheet.columns.findIndex((c) => c.includes('Exit Ticket')) < sheet.columns.findIndex((c) => c.includes('Best score')), 'exit ticket before the rest');
  const col = (h) => sheet.columns.findIndex((c) => c.includes(h));
  const row = (alias) => sheet.rows.find((r) => r[2] === alias);
  assert.deepEqual(sheet.rows.map((r) => r[2]), ['AlphaOwl17', 'VectorFox42', 'DeltaLynx33'], 'by period, then alias; retired and other classes left out');

  assert.equal(row('VectorFox42')[col('Joined')], '9:02 AM', 'joined time in the teacher’s time zone');
  assert.equal(row('DeltaLynx33')[col('Joined')], 'not recorded', 'a delivery with no join records says so');
  assert.equal(row('VectorFox42')[col('Q1')], 7, 'a number answer is a number');
  assert.equal(row('VectorFox42')[col('Q2')], 'C. 7', 'a choice shows its letter and text');
  assert.equal(row('AlphaOwl17')[col('Q3')], null);
  assert.equal(sheet.columns[col('Correct')], '4-12 Imaginary Numbers · Bellwork · Correct (of 2)');
  assert.equal(row('VectorFox42')[col('Correct')], 2);
  assert.equal(row('AlphaOwl17')[col('Correct')], 0, 'answered and wrong is 0');
  assert.equal(row('DeltaLynx33')[col('Correct')], 1);
  assert.equal(row('AlphaOwl17')[col('Best score')], 21);
  assert.equal(row('VectorFox42')[col('Best score')], null, 'no game played is blank, not 0');
  assert.equal(row('VectorFox42')[col('Exit Ticket · Response')], '=SUM(A1)', 'kept as typed (the CSV writer neutralizes it)');
});

test('by period: a sheet per class with just aliases down the side', () => {
  const sheets = buildReport(data, req({ breakdown: 'period' }));
  assert.deepEqual(sheets.map((s) => s.name), ['Honors Algebra II P3', 'Honors Algebra II P4']);
  assert.equal(sheets[0].columns[0], 'Alias');
  assert.deepEqual(sheets[0].rows.map((r) => r[0]), ['AlphaOwl17', 'VectorFox42']);
});

test('several lessons share one sheet, side by side; by lesson splits them', () => {
  const l2 = { ...run('r5', 'c3', 'Honors Algebra II', 'P3', '2026-11-03'), lessonId: 'L2', lessonTitle: '4-13 Complex Numbers' };
  const d = { ...data, runs: [...data.runs, l2] };
  const items = { L1: ['m-bell:results'], L2: ['m-bell:results'] };
  const [byPeriod] = buildReport(d, req({ runIds: ['r3', 'r5'], items, breakdown: 'period' }));
  assert.deepEqual(byPeriod.columns, [
    'Alias',
    '4-12 Imaginary Numbers · Bellwork · Correct (of 2)',
    '4-13 Complex Numbers · Bellwork · Correct (of 2)'
  ]);
  const byLesson = buildReport(d, req({ runIds: ['r3', 'r4', 'r5'], items, breakdown: 'lesson' }));
  assert.deepEqual(byLesson.map((s) => s.name), ['4-12 Imaginary Numbers', '4-13 Complex Numbers']);
  assert.equal(byLesson[0].rows.length, 3, 'both periods that had lesson 1');
  assert.equal(byLesson[1].rows.length, 2, 'only period 3 had lesson 2');
});

test('only picked items and picked deliveries are reported', () => {
  const [sheet] = buildReport(data, req({ runIds: ['r4'], items: { L1: ['m-bell:results', 'm-notes:none'] } }));
  assert.deepEqual(sheet.columns, ['Class', 'Period', 'Alias', '4-12 Imaginary Numbers · Bellwork · Correct (of 2)']);
  assert.deepEqual(sheet.rows, [['Honors Algebra II', 'P4', 'DeltaLynx33', 1]]);
  assert.deepEqual(buildReport(data, req({ items: {} })), [], 'nothing picked: no sheets');
});

test('question analysis: a row per question, percent correct overall and per period, common wrong answers', () => {
  const sheets = buildReport(data, req({ items: {}, questions: ['L1:m-bell:q1', 'L1:m-bell:q2', 'L1:m-bell:q3'] }));
  assert.deepEqual(sheets.map((s) => s.name), ['Questions']);
  const [q] = sheets;
  assert.deepEqual(q.columns, [
    'Lesson', 'Module', 'Question', 'Key', 'Answered', 'Correct', '% correct', 'Most common wrong answers',
    'Honors Algebra II P3 % correct', 'Honors Algebra II P4 % correct'
  ]);
  assert.deepEqual(q.rows[0], ['4-12 Imaginary Numbers', 'Bellwork', 'What is 3 + 4?', '7', 3, 1, 33, '12 (2)', 50, 0]);
  assert.deepEqual(q.rows[1].slice(3, 8), ['C. 7', 3, 2, 67, 'A. 4 (1)']);
  assert.deepEqual(q.rows[2].slice(3, 8), ['(no key)', 1, null, null, null], 'no key: counted, not marked');
});

test('sheet names: 31 characters, no forbidden characters, unique', () => {
  const taken = new Set();
  assert.equal(sheetName('Algebra II: Period 3 / Honors [Fall]', taken), 'Algebra II Period 3 Honors Fall');
  assert.equal(sheetName('All', taken), 'All');
  assert.equal(sheetName('all', taken), 'all 2');
  assert.ok(sheetName('x'.repeat(40), taken).length <= 31);
});

/* ---------------- the files ---------------- */

import { colName, crc32, toCsv, toXlsx } from '../src/lib/reports/files.ts';

test('CSV: UTF-8 marker, CRLF, quoting, blanks, and no formulas from student text', () => {
  const csv = toCsv({ name: 'x', columns: ['Alias', 'Answer', 'Score'], rows: [['VectorFox42', '=SUM(A1)', 3], ['AlphaOwl17', 'x², "quoted", ok', null], ['BetaYak20', '-x + 2', -4]] });
  assert.ok(csv.startsWith('﻿'));
  assert.equal(
    csv.slice(1),
    "Alias,Answer,Score\r\nVectorFox42,'=SUM(A1),3\r\nAlphaOwl17,\"x², \"\"quoted\"\", ok\",\r\nBetaYak20,'-x + 2,-4\r\n"
  );
});

test('xlsx pieces: column names and the zip checksum', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(colName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const bytes = toXlsx([{ name: 'All', columns: ['Alias'], rows: [['VectorFox42']] }]);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50, 'a zip');
});

test('math questions: marked at export time with each question\'s own rule, answers shown as typed', () => {
  const factoring = {
    id: 'm-fac',
    type: 'prompt',
    title: 'Factoring',
    config: {
      category: 'other',
      questions: [
        { id: 'a', kind: 'math', text: 'Factor x^2+7x+10', choices: [], answer: '(x+5)(x+2)', match: 'form' },
        { id: 'b', kind: 'math', text: 'Factor x^2+7x+10', choices: [], answer: '(x+5)(x+2)', match: 'any' }
      ]
    }
  };
  const d = {
    runs: [{ ...run('r3', 'c3', 'Honors Algebra II', 'P3'), modules: [factoring] }],
    aliases: [
      { id: 'a1', classId: 'c3', alias: 'VectorFox42', retired: false },
      { id: 'a2', classId: 'c3', alias: 'AlphaOwl17', retired: false }
    ],
    submissions: [
      { runId: 'r3', moduleId: 'm-fac', aliasId: 'a1', answers: { a: '(x+2)(x+5)', b: 'x^2+7x+10' } },
      { runId: 'r3', moduleId: 'm-fac', aliasId: 'a2', answers: { a: 'x^2+7x+10', b: 'x^2+7x+10' } }
    ],
    scores: [],
    joins: []
  };
  const [sheet] = buildReport(d, { runIds: ['r3'], items: { L1: ['m-fac:responses', 'm-fac:results'] }, breakdown: 'period', questions: [], timeZone: 'UTC' });
  const col = (h) => sheet.columns.findIndex((c) => c.includes(h));
  const row = (alias) => sheet.rows.find((r) => r[0] === alias);
  assert.equal(row('VectorFox42')[col('Correct')], 2, 'factors in another order; expanded form accepted where allowed');
  assert.equal(row('AlphaOwl17')[col('Correct')], 1, 'the expanded form is not the factored form');
  assert.equal(row('AlphaOwl17')[col('Q1')], 'x^2+7x+10', 'shown as typed');
  const [q] = buildReport(d, { runIds: ['r3'], items: {}, breakdown: 'period', questions: ['L1:m-fac:a', 'L1:m-fac:b'], timeZone: 'UTC' });
  assert.deepEqual(q.rows.map((r) => r.slice(4, 7)), [[2, 1, 50], [2, 2, 100]]);
});
