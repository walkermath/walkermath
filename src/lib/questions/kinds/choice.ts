// src/lib/questions/kinds/choice.ts
// Multiple choice. Answers and the key are the choice's index as text ('0', '1', ...). With `multi`
// students may pick several: the answer and key are the picked indices in order ('0,2'), and it's
// right only when the picks are exactly the right set.

import { cleanLine } from '../../lesson/clean.ts';
import { QUESTION_LIMITS, type Question, type QuestionKindDef } from '../types.ts';
import { judged, letter } from './shared.ts';

/** '2,0,2' -> '0,2' (picks in order, no repeats), or null if any pick isn't a choice. */
export function cleanPicks(v: string, count: number): string | null {
  if (v === '') return '';
  if (!/^\d{1,2}(,\d{1,2})*$/.test(v)) return null;
  const picks = [...new Set(v.split(',').map(Number))].sort((a, b) => a - b);
  return picks.every((p) => p < count) ? picks.join(',') : null;
}

const named = (q: Question, i: number) => (q.choices[i] !== undefined ? `${letter(i)}. ${q.choices[i]}` : String(i));

export const choice: QuestionKindDef = {
  kind: 'choice',
  label: 'multiple choice',
  hint: 'Students pick one of 2 to 6 choices, or pick every one that applies.',
  keyless: true,
  newQuestion: () => ({ choices: ['', ''] }),
  cleanQuestion(raw, base, ctx) {
    const choices = (Array.isArray(raw?.choices) ? raw.choices : []).map((x: unknown) => cleanLine(x, QUESTION_LIMITS.choice)).filter(Boolean);
    if (choices.length < 2 || choices.length > QUESTION_LIMITS.choices) return `${ctx.where}: question ${ctx.n} needs 2 to ${QUESTION_LIMITS.choices} choices.`;
    const a = base.answer;
    if (raw?.multi === true) return { choices, multi: true, answer: (a && cleanPicks(a, choices.length)) || '' };
    const answer = a && !(Number.isInteger(Number(a)) && Number(a) >= 0 && Number(a) < choices.length) ? '' : a;
    return { choices, answer };
  },
  cleanAnswer(v, q) {
    if (q.multi) return cleanPicks(v, q.choices.length) ?? { error: 'Invalid answers.' };
    return v === '' || (/^\d{1,2}$/.test(v) && Number(v) < q.choices.length) ? v : { error: 'Invalid answers.' };
  },
  grade: (q, a) => judged(q.multi ? cleanPicks(a, 99) === cleanPicks(q.answer, 99) : a === q.answer),
  answerText(q, a) {
    if (q.multi) return a.split(',').map((x) => named(q, Number(x))).join('; ');
    const i = Number(a);
    return Number.isInteger(i) && q.choices[i] !== undefined ? `${letter(i)}. ${q.choices[i]}` : a;
  },
  keyText: (q) =>
    q.answer === '' ? '' : q.multi ? q.answer.split(',').map((x) => named(q, Number(x))).join('; ') : `${letter(Number(q.answer))}. ${q.choices[Number(q.answer)] ?? ''}`,
  tags: (q) => (q.multi ? ['pick all that apply'] : [])
};
