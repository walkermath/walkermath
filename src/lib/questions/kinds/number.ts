// src/lib/questions/kinds/number.ts
// A number: "1,000", "3/4" and "-2.5" are read as numbers and compared by value. An answer that
// isn't a number falls back to a text match.

import { stripControl } from '../../lesson/clean.ts';
import { ANSWER_LIMITS, type QuestionKindDef } from '../types.ts';
import { judged, normText } from './shared.ts';

/** "1,000" -> 1000, "3/4" -> 0.75, " -2.5 " -> -2.5; NaN if it isn't a number. */
export function toNumber(s: string): number {
  const t = s.trim().replace(/,/g, '').replace(/\s+/g, '');
  if (/^[-+]?\d+(\.\d+)?$/.test(t) || /^[-+]?\.\d+$/.test(t)) return Number(t);
  const f = /^([-+]?\d+)\/(\d+)$/.exec(t);
  return f && Number(f[2]) !== 0 ? Number(f[1]) / Number(f[2]) : NaN;
}

export const number: QuestionKindDef = {
  kind: 'number',
  label: 'number',
  hint: 'A number. Fractions, commas and decimals are read by value: 3/4 matches 0.75.',
  keyless: true,
  newQuestion: () => ({ choices: [] }),
  cleanQuestion: (_raw, base, ctx) =>
    base.answer && !Number.isFinite(Number(base.answer)) ? `${ctx.where}: the answer to question ${ctx.n} should be a number.` : { choices: [] },
  cleanAnswer: (v) => (v.length > ANSWER_LIMITS.number ? { error: `Keep each answer under ${ANSWER_LIMITS.number} characters.` } : stripControl(v)),
  grade(q, a) {
    const x = toNumber(a);
    const k = toNumber(q.answer);
    if (!Number.isNaN(x) && !Number.isNaN(k)) return judged(Math.abs(x - k) <= 1e-9 * Math.max(1, Math.abs(k)));
    return judged(normText(a) === normText(q.answer));
  },
  answerText: (_q, a) => a.trim(),
  keyText: (q) => q.answer,
  tags: () => []
};
