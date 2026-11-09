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

const { cleanFeedbackInput, isRevised, FEEDBACK_MESSAGE_MAX } = await import('../src/lib/lesson/feedback.ts');

test("the teacher's feedback request is checked", () => {
  const base = { moduleId: 'm', aliasId: 'a', questionId: 'q' };
  assert.deepEqual(cleanFeedbackInput({ ...base, mark: 'partial', message: '  Close!\r\nTry again. ' }), { ...base, mark: 'partial', message: 'Close!\nTry again.' });
  assert.deepEqual(cleanFeedbackInput({ ...base, mark: null, message: 'just a note' }), { ...base, mark: null, message: 'just a note' });
  assert.deepEqual(cleanFeedbackInput({ ...base, mark: '' }), { ...base, mark: null, message: '' }, 'empty = clear');
  assert.deepEqual(cleanFeedbackInput({ ...base, mark: 'right', message: 'a\u0000b' }), { ...base, mark: 'right', message: 'ab' });
  assert.equal(typeof cleanFeedbackInput({ ...base, mark: 'excellent' }), 'string');
  assert.equal(typeof cleanFeedbackInput({ ...base, mark: 'right', message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) }), 'string');
  assert.equal(typeof cleanFeedbackInput({ ...base, message: ['hi'] }), 'string');
  assert.equal(typeof cleanFeedbackInput({ moduleId: 'm', aliasId: 'a' }), 'string');
  assert.equal(typeof cleanFeedbackInput({ ...base, questionId: 'x'.repeat(65) }), 'string');
  assert.equal(typeof cleanFeedbackInput(null), 'string');
});

test('revised: the answer changed after it was marked', () => {
  const fb = { mark: 'wrong', message: '', answer: '0.5', at: 1 };
  assert.equal(isRevised(fb, '0.5'), false);
  assert.equal(isRevised(fb, ' 0.5 '), false, 'spacing does not count');
  assert.equal(isRevised(fb, '0.84'), true);
  assert.equal(isRevised(fb, ''), true, 'cleared');
  assert.equal(isRevised(undefined, '0.84'), false, 'nothing marked yet');
});

const { buildReport, reportItems } = await import('../src/lib/lesson/reports.ts');

test('reports: Active Feedback has a Feedback item with a score and each question\'s mark', () => {
  const fm = { id: 'm-fb', type: 'activity', title: 'Explore the curve', config: { category: 'feedback', questions: [
    { id: 'q1', kind: 'text', text: 'What does the shaded area mean?', choices: [], answer: '' },
    { id: 'q2', kind: 'number', text: 'P(Z < 1)?', choices: [], answer: '' }
  ] } };
  const check = { id: 'm-ci', type: 'prompt', title: 'Check-in', config: { category: 'check-in', questions: [{ id: 'k1', kind: 'number', text: '2 + 2?', choices: [], answer: '4' }] } };
  const modules = [fm, check];
  const labels = reportItems(modules).map((i) => i.label);
  assert.deepEqual(labels, ['Joined', 'Explore the curve · Responses', 'Explore the curve · Feedback', 'Check-in · Responses', 'Check-in · Results']);
  assert.ok(!reportItems([check]).some((i) => i.kind === 'feedback'), 'check-ins have no Feedback item');

  const data = {
    runs: [{ id: 'r1', lessonId: 'L', lessonTitle: 'Normal curve day', classId: 'c1', className: 'Stats', period: 'P2', date: '2026-11-09', startTime: '09:00', modules }],
    aliases: [
      { id: 'a1', classId: 'c1', alias: 'AlphaOwl11', retired: false },
      { id: 'a2', classId: 'c1', alias: 'BetaYak22', retired: false },
      { id: 'a3', classId: 'c1', alias: 'GammaFox33', retired: false }
    ],
    submissions: [
      { runId: 'r1', moduleId: 'm-fb', aliasId: 'a1', answers: { q1: 'area below z', q2: '0.84' } },
      { runId: 'r1', moduleId: 'm-fb', aliasId: 'a2', answers: { q1: 'idk' } },
      { runId: 'r1', moduleId: 'm-fb', aliasId: 'a3', answers: { q2: '0.5' } },
      { runId: 'r1', moduleId: 'm-ci', aliasId: 'a1', answers: { k1: '4' } }
    ],
    scores: [],
    joins: [],
    feedback: [
      { runId: 'r1', moduleId: 'm-fb', aliasId: 'a1', questionId: 'q1', mark: 'partial' },
      { runId: 'r1', moduleId: 'm-fb', aliasId: 'a1', questionId: 'q2', mark: 'right' },
      { runId: 'r1', moduleId: 'm-fb', aliasId: 'a2', questionId: 'q1', mark: 'wrong' }
    ]
  };
  const pick = ['m-fb:feedback', 'm-ci:results'];
  const req = (over = {}) => ({ runIds: ['r1'], items: { L: pick }, breakdown: 'aggregate', questions: [], timeZone: 'America/Chicago', ...over });

  const [sheet] = buildReport(data, req());
  const col = (name) => sheet.columns.findIndex((c) => c.includes(name));
  const rowOf = (alias) => sheet.rows.find((r) => r[2] === alias);
  assert.ok(col('Score (of 2)') > 0, sheet.columns.join(' | '));
  assert.equal(rowOf('AlphaOwl11')[col('Score (of 2)')], 1.5, 'partly right is a half, right is one');
  assert.equal(rowOf('BetaYak22')[col('Score (of 2)')], 0, 'marked, not right yet: zero (not blank)');
  assert.equal(rowOf('GammaFox33')[col('Score (of 2)')], null, 'answered but unmarked: blank');
  assert.equal(rowOf('AlphaOwl11')[col('Q1 mark')], 'Partly right');
  assert.equal(rowOf('AlphaOwl11')[col('Q2 mark')], 'Right');
  assert.equal(rowOf('BetaYak22')[col('Q1 mark')], 'Not right yet');
  assert.equal(rowOf('BetaYak22')[col('Q2 mark')], null);
  assert.ok(!JSON.stringify(sheet).includes('message'), 'messages are never reported');

  // Without feedback data (older databases) nothing breaks and scores are blank.
  const bare = { ...data };
  delete bare.feedback;
  const [s2] = buildReport(bare, req());
  assert.equal(s2.rows.find((r) => r[2] === 'AlphaOwl11')[s2.columns.findIndex((c) => c.includes('Score'))], null);

  // The question sheet: marks for feedback questions, keys and % correct for the others.
  const sheets = buildReport(data, req({ questions: ['L:m-fb:q1', 'L:m-fb:q2', 'L:m-ci:k1'] }));
  const qs = sheets.at(-1);
  assert.equal(qs.name, 'Questions');
  const qc = (name) => qs.columns.indexOf(name);
  const q1 = qs.rows.find((r) => r[2] === 'What does the shaded area mean?');
  assert.deepEqual([q1[qc('Key')], q1[qc('Answered')], q1[qc('Marked right')], q1[qc('Marked partly right')], q1[qc('Marked not right yet')]], ['(marked by teacher)', 2, 0, 1, 1]);
  assert.equal(q1[qc('% correct')], null);
  const k1 = qs.rows.find((r) => r[2] === '2 + 2?');
  assert.deepEqual([k1[qc('Key')], k1[qc('% correct')], k1[qc('Marked right')]], ['4', 100, null]);
  // Only keyed questions: no mark columns at all.
  const plain = buildReport(data, req({ questions: ['L:m-ci:k1'] })).at(-1);
  assert.ok(!plain.columns.includes('Marked right'));
});
