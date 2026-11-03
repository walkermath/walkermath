// scripts/test-sort.mjs
// Card sort questions (src/lib/lesson/sort.ts): groups, cards, keys, placements and marking.
//   npm run test:sort

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSort, cleanSortAnswer, newSort, sortCorrect, sortMarks, sortText } from '../src/lib/lesson/sort.ts';
import { cleanAnswers, isCorrect } from '../src/lib/lesson/answers.ts';
import { answerText } from '../src/lib/lesson/reports.ts';
import { lessonFromMarkdown, lessonToMarkdown } from '../src/lib/lesson/exportMd.ts';

const spec = newSort(); // Linear / Not linear; y = 3x + 1, y = x^2, y = -2x, y = 2^x
const key = JSON.stringify(['0', '1', '0', '1']);

test('cleanSort: 2-6 named groups, 2-16 cards with text, keys that point at a group', () => {
  const ok = cleanSort(spec, key);
  assert.deepEqual(ok.sort, spec);
  assert.equal(ok.answer, key);
  assert.equal(cleanSort(spec, JSON.stringify(['0', '7', 'x'])).answer, JSON.stringify(['0', '', '', '']), 'a key to no group is dropped');
  assert.equal(cleanSort(spec, '').answer, '');
  assert.match(cleanSort({ ...spec, groups: ['only one'] }, ''), /2 to 6 groups/);
  assert.match(cleanSort({ ...spec, cards: ['a'] }, ''), /2 to 16 cards/);
  assert.match(cleanSort({ ...spec, groups: ['A', ' '] }, ''), /every group needs a name/);
  assert.match(cleanSort({ ...spec, cards: ['a', ''] }, ''), /every card needs some text/);
});

test("students' placements: group numbers in card order, checked", () => {
  assert.equal(cleanSortAnswer('', spec), '');
  assert.equal(cleanSortAnswer(JSON.stringify(['0', '', '1']), spec), JSON.stringify(['0', '', '1']));
  assert.equal(cleanSortAnswer(JSON.stringify(['', '', '', '']), spec), '', 'nothing placed is no answer');
  assert.equal(cleanSortAnswer(JSON.stringify(['2']), spec), null, 'no group 2');
  assert.equal(cleanSortAnswer(JSON.stringify(['0', '0', '0', '0', '0']), spec), null, 'more than the cards');
  assert.equal(cleanSortAnswer('{', spec), null);
  const q = { kind: 'questions', questions: [{ id: 's', kind: 'sort', text: 'Sort', choices: [], sort: spec }] };
  assert.deepEqual(cleanAnswers(q, { s: JSON.stringify(['0', '1']) }), { s: JSON.stringify(['0', '1']) });
  assert.equal(cleanAnswers(q, { s: JSON.stringify(['5']) }), 'Invalid answers.');
});

test('marking: right when every keyed card is in its group', () => {
  assert.equal(sortCorrect(key, key), true);
  assert.deepEqual(sortMarks(key, JSON.stringify(['0', '0', '0', '1'])), [true, false, true, true]);
  assert.equal(sortCorrect(key, JSON.stringify(['0', '0', '0', '1'])), false);
  assert.equal(sortCorrect(key, JSON.stringify(['0', '1', '0', ''])), false, 'a keyed card left out is not right');
  assert.equal(sortCorrect(JSON.stringify(['0', '', '', '']), JSON.stringify(['0', '0', '1', '1'])), true, 'only keyed cards count');
  assert.equal(sortCorrect(key, ''), null);
  assert.equal(sortCorrect('', key), null);
  assert.equal(isCorrect({ kind: 'sort', answer: key }, key), true);
});

test('as text, for the answers table, reports and exports', () => {
  assert.equal(sortText(spec, JSON.stringify(['0', '', '1'])), 'y = 3x + 1 → Linear | y = x^2 → _ | y = -2x → Not linear | y = 2^x → _');
  assert.equal(answerText({ kind: 'sort', choices: [], sort: spec }, key), 'y = 3x + 1 → Linear | y = x^2 → Not linear | y = -2x → Linear | y = 2^x → Not linear');
  const lesson = { title: 'Sorts', topic: '', objective: '', successCriteria: '', standards: '', resources: [], durationSec: 600, modules: [
    { id: crypto.randomUUID(), type: 'prompt', title: 'Check-in', plannedSec: 300, pacing: 'flex', minSec: null, onTimeUp: 'auto', teacherNotes: '',
      config: { category: 'check-in', questions: [{ id: crypto.randomUUID(), kind: 'sort', text: 'Sort them', choices: [], answer: key, sort: spec }] } }] };
  const md = lessonToMarkdown(lesson);
  assert.match(md, /Groups: Linear · Not linear/);
  assert.match(md, /> Answer: y = 3x \+ 1 → Linear/);
  assert.deepEqual(lessonFromMarkdown(md).lesson, lesson);
});
