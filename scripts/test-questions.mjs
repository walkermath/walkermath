// scripts/test-questions.mjs
// The question handler (src/lib/questions/): every kind through one registry, checked against the
// grader it replaced, plus cleaning, text and questionsOf.
//   npm run test:questions

import assert from 'node:assert/strict';
import test from 'node:test';
import * as Q from '../src/lib/questions/index.ts';

// The grader before the registry, copied as it was (answers.ts @ master, Nov 28 2026), for parity.
import { checkMath } from '../src/lib/lesson/mathcheck.ts';
import { gridCorrect } from '../src/lib/lesson/grid.ts';
import { sortCorrect } from '../src/lib/lesson/sort.ts';
function oldIsCorrect(q, answer) {
  if (!q.answer) return null;
  if (answer === undefined || answer.trim() === '') return null;
  if (q.kind === 'choice') return answer === q.answer;
  if (q.kind === 'sort') return sortCorrect(q.answer, answer);
  if (q.kind === 'grid') return gridCorrect(q.answer, answer, q.match === 'any' ? 'any' : 'form', q.grid);
  if (q.kind === 'math') return checkMath(q.answer, answer, q.match === 'any' ? 'any' : 'form');
  if (q.kind === 'number') {
    const a = Q.toNumber(answer);
    const k = Q.toNumber(q.answer);
    if (!Number.isNaN(a) && !Number.isNaN(k)) return Math.abs(a - k) <= 1e-9 * Math.max(1, Math.abs(k));
  }
  const norm = (v) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(answer) === norm(q.answer);
}

const grid = { rows: 2, cols: 2, cells: [[{ text: 'x' }, { text: '', blank: true }], [{ text: '', blank: true }, { text: '2' }]] };
const cases = [
  [{ kind: 'text', answer: 'Vertex' }, [' vertex ', 'VERTEX', 'vortex', '', undefined, '  ']],
  [{ kind: 'text', answer: '' }, ['anything']],
  [{ kind: 'number', answer: '0.75' }, ['3/4', '.75', '0.750', '0.7', '1,000', 'three quarters', '']],
  [{ kind: 'number', answer: '1000' }, ['1,000', '1 000', '999.9999999999', '1e3']],
  [{ kind: 'number', answer: '-2.5' }, ['-2.5', '-5/2', '2.5', '+-2.5']],
  [{ kind: 'choice', answer: '1', choices: ['a', 'b', 'c'] }, ['1', '0', '2', '']],
  [{ kind: 'math', answer: '(x+2)(x+5)', match: 'form' }, ['(x+5)(x+2)', 'x^2+7x+10', '(x+2)(x+5)', '(x+2)(x+6)', 'x +']],
  [{ kind: 'math', answer: '(x+2)(x+5)', match: 'any' }, ['x^2+7x+10', '(x+5)(x+2)', 'x^2+7x+11']],
  [{ kind: 'math', answer: 'x = 7', match: 'form' }, ['x=7', '7 = x', 'x + 5 = 12']],
  [{ kind: 'sort', answer: '["0","1","0"]', sort: { groups: ['A', 'B'], cards: ['p', 'q', 'r'] } }, ['["0","1","0"]', '["1","1","0"]', '["","",""]', '[]', 'junk']],
  [{ kind: 'grid', answer: '["2x","x"]', match: 'form', grid }, ['["2x","x"]', '["x2","x"]', '["2x",""]', '["",""]', '["3x","x"]']]
];

test('parity: every case grades exactly as the old isCorrect did', () => {
  let n = 0;
  for (const [base, answers] of cases) {
    const q = { id: 'q', text: 't', choices: [], ...base };
    for (const a of answers) {
      assert.equal(Q.isCorrect(q, a), oldIsCorrect(q, a), `${q.kind} key ${q.answer} answer ${JSON.stringify(a)}`);
      n++;
    }
  }
  assert.ok(n > 40);
});

test('grades carry a status, a score out of a max, and per-part marks for grids and sorts', () => {
  const q = { id: 'q', kind: 'text', text: 't', choices: [], answer: 'yes' };
  assert.deepEqual(Q.gradeAnswer(q, 'Yes'), { status: 'right', score: 1, max: 1, source: 'auto' });
  assert.equal(Q.gradeAnswer(q, 'no').status, 'wrong');
  assert.equal(Q.gradeAnswer(q, ' ').status, 'blank');
  assert.equal(Q.gradeAnswer({ ...q, answer: '' }, 'yes').status, 'unkeyed');
  const s = Q.gradeAnswer({ id: 's', kind: 'sort', text: 't', choices: [], answer: '["0","1"]', sort: { groups: ['A', 'B'], cards: ['p', 'q'] } }, '["0","0"]');
  assert.deepEqual(s.parts, [true, false]);
  assert.equal(s.status, 'wrong', 'still all-or-nothing (partial credit is a later per-question toggle)');
});

test('cleaning a teacher question keeps today\'s rules and messages', () => {
  assert.equal(Q.cleanQuestion({ kind: 'text', text: '  ' }, 'Bellwork', 2), 'Bellwork: question 2 is empty.');
  assert.equal(Q.cleanQuestion({ kind: 'choice', text: 'Pick', choices: ['a'] }, 'Bellwork', 1), 'Bellwork: question 1 needs 2 to 6 choices.');
  assert.equal(Q.cleanQuestion({ kind: 'number', text: 'n', answer: 'abc' }, 'Exit', 3), 'Exit: the answer to question 3 should be a number.');
  assert.match(Q.cleanQuestion({ kind: 'math', text: 'm', answer: 'x +' }, 'Exit', 1), /^Exit: the answer to question 1 can't be read/);
  const c = Q.cleanQuestion({ kind: 'choice', text: 'Pick', choices: ['a', ' ', 'b'], answer: '5' }, 'B', 1);
  assert.deepEqual([c.choices, c.answer], [['a', 'b'], ''], 'blank choices dropped, an out-of-range key cleared');
  const m = Q.cleanQuestion({ kind: 'math', text: 'm', answer: 'x+1', match: 'any' }, 'B', 1);
  assert.equal(m.match, 'any');
  assert.equal(Q.cleanQuestion({ kind: 'weird', text: 'w' }, 'B', 1).kind, 'text', 'unknown kinds read as text');
});

test('keyless (Active Feedback): only keyless kinds, no key, no matching rule', () => {
  const m = Q.cleanQuestion({ kind: 'math', text: 'm', answer: 'x+1', match: 'any' }, 'F', 1, true);
  assert.equal(m.answer, '');
  assert.equal(m.match, undefined);
  assert.equal(Q.cleanQuestion({ kind: 'grid', text: 'g' }, 'F', 1, true).kind, 'text');
  assert.deepEqual(Q.KEYLESS_KINDS.sort(), ['choice', 'math', 'number', 'text']);
});

test('student answers are checked by their kind', () => {
  const choice = { id: 'c', kind: 'choice', text: 't', choices: ['a', 'b'], answer: '' };
  assert.equal(Q.cleanAnswer(choice, '1'), '1');
  assert.deepEqual(Q.cleanAnswer(choice, '2'), { error: 'Invalid answers.' });
  assert.deepEqual(Q.cleanAnswer(choice, 5), { error: 'Invalid answers.' });
  const num = { id: 'n', kind: 'number', text: 't', choices: [], answer: '' };
  assert.deepEqual(Q.cleanAnswer(num, '1'.repeat(41)), { error: 'Keep each answer under 40 characters.' });
  assert.equal(Q.cleanAnswer({ ...num, kind: 'text' }, 'a\u0001b'), 'ab');
});

test('answers and keys read the same way everywhere', () => {
  const c = { id: 'c', kind: 'choice', text: 't', choices: ['x = 2', 'x = 3'], answer: '1' };
  assert.equal(Q.answerText(c, '1'), 'B. x = 3');
  assert.equal(Q.answerText(c, ''), null);
  assert.equal(Q.keyText(c), 'B. x = 3');
  assert.equal(Q.keyText(c, { short: true }), 'B');
  assert.equal(Q.keyText({ ...c, answer: '' }), '');
  const g = { id: 'g', kind: 'grid', text: 't', choices: [], answer: '["2x",""]', grid };
  assert.equal(Q.keyText(g), '2x | _');
  assert.deepEqual(Q.questionTags({ id: 'm', kind: 'math', text: 't', choices: [], answer: 'x', match: 'any' }), ['any equivalent form']);
});

test('questionsOf: prompts and Active Feedback have questions; nothing else does', () => {
  const qs = [{ id: 'a' }];
  assert.equal(Q.questionsOf({ type: 'prompt', config: { questions: qs } }), qs);
  assert.equal(Q.questionsOf({ type: 'activity', config: { category: 'feedback', questions: qs } }), qs);
  assert.deepEqual(Q.questionsOf({ type: 'activity', config: { category: 'turn-talk', questions: qs } }), []);
  assert.deepEqual(Q.questionsOf({ type: 'independent', config: { response: 'short' } }), []);
  assert.deepEqual(Q.questionsOf(null), []);
});

test('a new question of each kind starts the way the builder always started it', () => {
  for (const k of Q.QUESTION_KIND_LIST) {
    const q = Q.newQuestion(k);
    assert.equal(q.kind, k);
    assert.equal(q.answer, '');
    assert.ok(q.id.length === 36);
  }
  assert.deepEqual(Q.newQuestion('choice').choices, ['', '']);
  assert.equal(Q.newQuestion('math').match, 'form');
  assert.ok(Q.newQuestion('grid').grid && Q.newQuestion('sort').sort);
});

test('a key is moved out of the public config whatever module it sits in', async () => {
  const { splitModule, publicModule, joinModule } = await import('../src/lib/lesson/modules.ts');
  // An activity carrying a keyed question (not possible through the builder today, but it mustn't leak).
  const m = { id: 'm', type: 'activity', title: 'T&T', plannedSec: 300, pacing: 'flex', teacherNotes: '', config: { category: 'turn-talk', questions: [{ id: 'q', kind: 'text', text: 't', choices: [], answer: 'secret' }] } };
  const s = splitModule(m);
  assert.equal(s.config.questions[0].answer, '');
  assert.deepEqual(s.private.answers, { q: 'secret' });
  assert.ok(!JSON.stringify(publicModule(m)).includes('secret'));
  assert.equal(joinModule(s.config, s.private, 'activity').questions[0].answer, 'secret');
});

test('partial credit (grid and card sort): the share right, only when the toggle is on', () => {
  const sort = { id: 's', kind: 'sort', text: 't', choices: [], answer: '["0","1","0","1"]', sort: { groups: ['A', 'B'], cards: ['p', 'q', 'r', 's'] } };
  assert.equal(Q.gradeAnswer(sort, '["0","1","0","0"]').status, 'wrong', 'off: all or nothing, as before');
  const on = { ...sort, partial: true };
  assert.deepEqual([Q.gradeAnswer(on, '["0","1","0","0"]').status, Q.gradeAnswer(on, '["0","1","0","0"]').score], ['partial', 0.75]);
  assert.equal(Q.gradeAnswer(on, '["0","1","0","1"]').status, 'right');
  assert.equal(Q.gradeAnswer(on, '["1","0","1","0"]').status, 'wrong');
  assert.equal(Q.gradeAnswer(on, '["0","","",""]').score, 0.25, 'cards left out count as not right');
  assert.equal(Q.questionMark(on, '["0","1","0","0"]'), 0.75);
  assert.equal(Q.isCorrect(on, '["0","1","0","0"]'), false, 'the ✓ count still needs all of it');

  const grid = { rows: 2, cols: 2, cells: [[{ text: '', blank: true }, { text: '', blank: true }], [{ text: '', blank: true }, { text: 'x' }]] };
  const g = { id: 'g', kind: 'grid', text: 't', choices: [], answer: '["1","2",""]', match: 'form', grid, partial: true };
  assert.equal(Q.gradeAnswer(g, '["1","3","9"]').score, 0.5, 'unkeyed blanks are not counted');
  assert.deepEqual(Q.questionTags(g), ['same form, any order', 'partial credit']);

  const kept = Q.cleanQuestion({ kind: 'sort', text: 's', partial: true, sort: sort.sort, answer: sort.answer }, 'B', 1);
  assert.equal(kept.partial, true);
  assert.equal(Q.cleanQuestion({ kind: 'sort', text: 's', partial: 'yes', sort: sort.sort, answer: sort.answer }, 'B', 1).partial, undefined);
});
