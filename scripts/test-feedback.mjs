// scripts/test-feedback.mjs
// Active Feedback activities (src/lib/lesson/modules.ts, answers.ts): questions with no answer key
// that students answer during the lesson and the teacher marks by hand.
//   npm run test:feedback

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { cleanModule, newModule, newQuestion, publicModule, MODULE_TYPES, isFeedbackActivity } = await import('../src/lib/lesson/modules.ts');
const { answerSpec, cleanAnswers, isCorrect } = await import('../src/lib/lesson/answers.ts');
const { lessonToMarkdown } = await import('../src/lib/lesson/exportMd.ts');
const { freshLesson } = await import('../src/lib/server/library.ts');

const q = (kind, text, extra = {}) => ({ ...newQuestion(kind), text, ...extra });

function feedback(questions) {
  const m = newModule('activity', 'feedback');
  m.config.instructions = 'Open the normal curve app.';
  m.config.links = [{ label: 'Normal curve', url: 'https://walkermath.com/apps/normal' }];
  m.config.questions = questions;
  return m;
}

test('a new Active Feedback activity: questions, no done tap, holds at time up', () => {
  const m = newModule('activity', 'feedback');
  assert.equal(m.config.category, 'feedback');
  assert.equal(m.title, 'Active feedback');
  assert.deepEqual(m.config.questions, []);
  assert.equal(m.config.doneTap, false);
  assert.equal(m.onTimeUp, 'hold');
  assert.ok(isFeedbackActivity(m));
  assert.equal(MODULE_TYPES.activity.collects(m.config), true);
  assert.equal(MODULE_TYPES.activity.collects(newModule('activity', 'turn-talk').config), false);
});

test('saving drops any key, matching rule, or kind that needs a key', () => {
  const m = feedback([
    q('text', 'What does the shaded area mean?', { answer: 'a probability' }),
    q('math', 'Write the z-score', { answer: 'z=1.5', match: 'any' }),
    q('choice', 'Which is wider?', { choices: ['n = 10', 'n = 40'], answer: '0' }),
    q('grid', 'A table', {}),
    q('sort', 'A sort', {})
  ]);
  m.config.doneTap = true;
  const clean = cleanModule(m, 0);
  assert.equal(typeof clean, 'object', String(clean));
  const qs = clean.config.questions;
  assert.equal(qs.length, 5);
  for (const x of qs) {
    assert.equal(x.answer, '', 'no key');
    assert.equal(x.match, undefined, 'no matching rule');
    assert.equal(x.grid, undefined);
    assert.equal(x.sort, undefined);
  }
  assert.deepEqual(qs.map((x) => x.kind), ['text', 'math', 'choice', 'text', 'text'], 'grid and sort become short text');
  assert.equal(clean.config.doneTap, false, 'answering is the hand-in');
  assert.equal(clean.config.links.length, 1);
});

test('feedback questions are checked like any others', () => {
  assert.equal(typeof cleanModule(feedback([q('text', '   ')]), 0), 'string', 'empty question');
  assert.equal(typeof cleanModule(feedback([q('choice', 'Pick', { choices: ['only one'] })]), 0), 'string', 'too few choices');
  assert.equal(typeof cleanModule(feedback(Array.from({ length: 21 }, (_, i) => q('text', `Q${i}`))), 0), 'string', 'too many');
});

test('other activities never keep questions; check-ins keep their keys', () => {
  const m = feedback([q('text', 'Why?')]);
  m.config.category = 'turn-talk';
  const clean = cleanModule(m, 0);
  assert.equal(clean.config.questions, undefined);
  const p = newModule('prompt', 'check-in');
  p.config.questions = [q('number', '2 + 2?', { answer: '4' })];
  assert.equal(cleanModule(p, 0).config.questions[0].answer, '4');
});

test('students answer the questions; nothing is auto-marked', () => {
  const m = cleanModule(feedback([q('text', 'Describe the shape'), q('number', 'What is the mean?')]), 0);
  const [a, b] = m.config.questions;
  const spec = answerSpec(m);
  assert.equal(spec.kind, 'questions');
  assert.deepEqual(cleanAnswers(spec, { [a.id]: 'bell shaped', [b.id]: '70' }), { [a.id]: 'bell shaped', [b.id]: '70' });
  assert.equal(typeof cleanAnswers(spec, { done: '1' }), 'string', 'no done tap');
  assert.equal(isCorrect(b, '70'), null, 'no key, no mark');
  assert.equal(answerSpec(cleanModule(feedback([]), 0)), null, 'no questions, nothing to hand in');
});

test('students get the questions with no answer field', () => {
  const m = cleanModule(feedback([q('text', 'Why?')]), 0);
  const pub = publicModule(m);
  assert.equal(pub.collects, true);
  assert.equal(pub.config.category, 'feedback');
  assert.equal(pub.config.questions.length, 1);
  assert.ok(!('answer' in pub.config.questions[0]));
  assert.equal(pub.config.links[0].label, 'Normal curve');
});

test('export lists the instructions, links and questions; library copies get fresh question ids', () => {
  const m = cleanModule(feedback([q('text', 'What does 0.8413 mean here?')]), 0);
  const lesson = { title: 'Normal curve day', topic: '', objective: '', successCriteria: '', standards: '', resources: [], durationSec: 3000, modules: [m] };
  const md = lessonToMarkdown(lesson);
  assert.match(md, /Open the normal curve app\./);
  assert.match(md, /\[Normal curve\]\(https:\/\/walkermath\.com\/apps\/normal\)/);
  assert.match(md, /\*\*Q1\.\*\* What does 0\.8413 mean here\?/);
  const fresh = freshLesson(lesson);
  assert.equal(typeof fresh, 'object', String(fresh));
  const copied = fresh.modules[0].config.questions[0];
  assert.equal(copied.text, 'What does 0.8413 mean here?');
  assert.notEqual(copied.id, m.config.questions[0].id);
});
