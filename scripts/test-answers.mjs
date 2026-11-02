// What students hand in (src/lib/lesson/answers.ts). Run: npm run test:answers
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { answerSpec, cleanAnswers, isAnswered, isCorrect, toNumber, checkSubmission } = await import('../src/lib/lesson/answers.ts');
const { startRoom, apply } = await import('../src/lib/lesson/room.ts');

const prompt = {
  id: 'p', type: 'prompt', title: 'Bellwork', plannedSec: 300, pacing: 'locked', minSec: null, onTimeUp: 'auto', collects: true,
  config: { category: 'bellwork', questions: [
    { id: 'q1', kind: 'number', text: '2 + 2?', choices: [] },
    { id: 'q2', kind: 'choice', text: 'Pick', choices: ['a', 'b', 'c'] },
    { id: 'q3', kind: 'text', text: 'Why?', choices: [] }
  ] }
};
const notes = { ...prompt, id: 'n', type: 'notes', config: { slides: [] } };
const indep = (response) => ({ ...prompt, id: 'i' + response, type: 'independent', config: { instructions: '', links: [], response } });
const activity = (doneTap) => ({ ...prompt, id: 'a', type: 'activity', config: { category: 'other', instructions: '', links: [], doneTap, coliseumId: '' } });

test('which modules take answers, and what kind', () => {
  assert.equal(answerSpec(prompt).kind, 'questions');
  assert.equal(answerSpec({ ...prompt, config: { questions: [] } }), null, 'a prompt with no questions takes nothing');
  assert.equal(answerSpec(notes), null);
  assert.equal(answerSpec(indep('short')).kind, 'short');
  assert.equal(answerSpec(indep('done')).kind, 'tap');
  assert.equal(answerSpec(indep('none')), null);
  assert.equal(answerSpec(activity(true)).kind, 'tap');
  assert.equal(answerSpec(activity(false)), null);
});

test('answers are checked against the module', () => {
  const spec = answerSpec(prompt);
  assert.deepEqual(cleanAnswers(spec, { q1: '4', q2: '1', q3: 'because' }), { q1: '4', q2: '1', q3: 'because' });
  assert.equal(typeof cleanAnswers(spec, { q9: 'x' }), 'string', 'unknown question');
  assert.equal(typeof cleanAnswers(spec, { q2: '3' }), 'string', 'no such choice');
  assert.equal(typeof cleanAnswers(spec, { q2: 'b' }), 'string');
  assert.equal(typeof cleanAnswers(spec, { q3: 'x'.repeat(501) }), 'string', 'too long');
  assert.equal(typeof cleanAnswers(spec, { q1: 4 }), 'string', 'text only');
  assert.equal(typeof cleanAnswers(spec, ['4']), 'string');
  assert.deepEqual(cleanAnswers(spec, { q3: 'a\u0000b' }), { q3: 'ab' }, 'control characters dropped');
  assert.deepEqual(cleanAnswers(answerSpec(indep('short')), { short: 'my work' }), { short: 'my work' });
  assert.equal(typeof cleanAnswers(answerSpec(indep('done')), { done: 'yes' }), 'string');
  assert.deepEqual(cleanAnswers(answerSpec(indep('done')), { done: '1' }), { done: '1' });
});

test('handed in = something filled (a tap counts; an empty form does not)', () => {
  const spec = answerSpec(prompt);
  assert.equal(isAnswered(spec, undefined), false);
  assert.equal(isAnswered(spec, { q1: '  ' }), false);
  assert.equal(isAnswered(spec, { q1: '4' }), true);
  assert.equal(isAnswered(answerSpec(indep('done')), { done: '' }), false);
  assert.equal(isAnswered(answerSpec(indep('done')), { done: '1' }), true);
});

test('marking against the key: numbers, fractions, choices, text', () => {
  assert.equal(toNumber('1,000'), 1000);
  assert.equal(toNumber('3/4'), 0.75);
  assert.equal(toNumber(' -2.5 '), -2.5);
  assert.ok(Number.isNaN(toNumber('four')));
  assert.equal(isCorrect({ kind: 'number', answer: '0.75' }, '3/4'), true);
  assert.equal(isCorrect({ kind: 'number', answer: '4' }, '4.0'), true);
  assert.equal(isCorrect({ kind: 'number', answer: '4' }, '5'), false);
  assert.equal(isCorrect({ kind: 'choice', answer: '1' }, '1'), true);
  assert.equal(isCorrect({ kind: 'choice', answer: '1' }, '2'), false);
  assert.equal(isCorrect({ kind: 'text', answer: 'Slope' }, '  slope '), true);
  assert.equal(isCorrect({ kind: 'text', answer: '' }, 'anything'), null, 'no key');
  assert.equal(isCorrect({ kind: 'text', answer: 'x' }, ''), null, 'no answer');
});

test("the room's decision on a submission", () => {
  const ms = [prompt, notes];
  const t0 = 1_000_000;
  let s = startRoom('run', ms, t0 + 30 * 60_000, t0);
  assert.equal(checkSubmission(s, ms, 'p', { q1: '4' }, t0 + 1000).ok, true);
  assert.equal(checkSubmission(s, ms, 'nope', { q1: '4' }, t0).status, 404);
  assert.equal(checkSubmission(s, ms, 'n', {}, t0).status, 400, 'notes take nothing');
  assert.equal(checkSubmission(s, ms, 'p', { q2: '9' }, t0).status, 400);
  s = apply(s, ms, { type: 'next' }, t0 + 60_000);
  const late = checkSubmission(s, ms, 'p', { q1: '5' }, t0 + 120_000);
  assert.equal(late.ok, false);
  assert.equal(late.closed, true);
  assert.equal(late.status, 409);
});
