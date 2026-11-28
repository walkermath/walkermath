// src/lib/questions/kinds/choice.ts
// Multiple choice: one right choice. Answers and the key are the choice's index as text ('0', '1', ...).

import { cleanLine } from '../../lesson/clean.ts';
import { QUESTION_LIMITS, type QuestionKindDef } from '../types.ts';
import { judged, letter } from './shared.ts';

export const choice: QuestionKindDef = {
  kind: 'choice',
  label: 'multiple choice',
  hint: 'Students pick one of 2 to 6 choices.',
  keyless: true,
  newQuestion: () => ({ choices: ['', ''] }),
  cleanQuestion(raw, base, ctx) {
    const choices = (Array.isArray(raw?.choices) ? raw.choices : []).map((x: unknown) => cleanLine(x, QUESTION_LIMITS.choice)).filter(Boolean);
    if (choices.length < 2 || choices.length > QUESTION_LIMITS.choices) return `${ctx.where}: question ${ctx.n} needs 2 to ${QUESTION_LIMITS.choices} choices.`;
    const a = base.answer;
    const answer = a && !(Number.isInteger(Number(a)) && Number(a) >= 0 && Number(a) < choices.length) ? '' : a;
    return { choices, answer };
  },
  cleanAnswer: (v, q) => (v === '' || (/^\d{1,2}$/.test(v) && Number(v) < q.choices.length) ? v : { error: 'Invalid answers.' }),
  grade: (q, a) => judged(a === q.answer),
  answerText(q, a) {
    const i = Number(a);
    return Number.isInteger(i) && q.choices[i] !== undefined ? `${letter(i)}. ${q.choices[i]}` : a;
  },
  keyText: (q) => (q.answer === '' ? '' : `${letter(Number(q.answer))}. ${q.choices[Number(q.answer)] ?? ''}`),
  tags: () => []
};
