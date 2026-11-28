// src/lib/questions/kinds/number.ts
// A number. By default "1,000", "3/4" and "-2.5" are read as numbers and compared by value, and an
// answer that isn't a number falls back to a text match (as it always has).
//
// The teacher can also choose, per question:
//   format    'percent': answers are percents (84.13 or 84.13%); a proportion (0.8413) is not accepted.
//             'number' (default): a % sign is not accepted.
//   decimals  N: the answer must be written to exactly N decimal places and equal the key rounded
//             to N places. Unset: exact.
// The rule is shown to students next to the question, so they know what form to use.

import { stripControl } from '../../lesson/clean.ts';
import { ANSWER_LIMITS, QUESTION_LIMITS, type Question, type QuestionKindDef } from '../types.ts';
import { judged, normText } from './shared.ts';

/** "1,000" -> 1000, "3/4" -> 0.75, " -2.5 " -> -2.5; NaN if it isn't a number. */
export function toNumber(s: string): number {
  const t = s.trim().replace(/,/g, '').replace(/\s+/g, '');
  if (/^[-+]?\d+(\.\d+)?$/.test(t) || /^[-+]?\.\d+$/.test(t)) return Number(t);
  const f = /^([-+]?\d+)\/(\d+)$/.exec(t);
  return f && Number(f[2]) !== 0 ? Number(f[1]) / Number(f[2]) : NaN;
}

const ruled = (q: Question) => q.format === 'percent' || q.decimals !== undefined;
const placesOf = (t: string) => {
  const m = /\.(\d+)$/.exec(t);
  return m ? m[1].length : 0;
};
const round = (x: number, n: number) => Number((Math.round(Number(x + 'e' + n)) / 10 ** n).toFixed(n));

/** The rule students see: "percent, 2 decimal places", "a whole number", "" when there is none. */
export function numberRule(q: Pick<Question, 'format' | 'decimals'>): string {
  const pct = q.format === 'percent';
  if (q.decimals === undefined) return pct ? 'a percent' : '';
  const places = q.decimals === 0 ? (pct ? 'a whole percent' : 'a whole number') : `${q.decimals} decimal place${q.decimals === 1 ? '' : 's'}`;
  return q.decimals === 0 ? places : pct ? `percent, ${places}` : `rounded to ${places}`;
}

/** A ruled answer as a number, or null when it isn't in the chosen form. */
function readRuled(q: Question, raw: string): number | null {
  let t = raw.trim().replace(/,/g, '').replace(/\s+/g, '');
  const hasPct = t.endsWith('%');
  if (hasPct) t = t.slice(0, -1);
  if (hasPct && q.format !== 'percent') return null;
  if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(t)) return null; // decimals only: no fractions in a ruled answer
  if (q.decimals !== undefined && placesOf(t) !== q.decimals) return null;
  return Number(t);
}

export const number: QuestionKindDef = {
  kind: 'number',
  label: 'number',
  hint: 'A number. Fractions, commas and decimals are read by value, or require a percent and a number of decimal places.',
  keyless: true,
  newQuestion: () => ({ choices: [] }),
  cleanQuestion(raw, base, ctx) {
    const format = raw?.format === 'percent' ? ('percent' as const) : undefined;
    const d = Number(raw?.decimals);
    const decimals = raw?.decimals !== undefined && raw?.decimals !== null && raw?.decimals !== '' && Number.isInteger(d) && d >= 0 && d <= QUESTION_LIMITS.decimals ? d : undefined;
    const key = format ? base.answer.replace(/%\s*$/, '').trim() : base.answer;
    if (key && !Number.isFinite(Number(key))) return `${ctx.where}: the answer to question ${ctx.n} should be a number.`;
    return { choices: [], answer: key, ...(format ? { format } : {}), ...(decimals !== undefined ? { decimals } : {}) };
  },
  cleanAnswer: (v) => (v.length > ANSWER_LIMITS.number ? { error: `Keep each answer under ${ANSWER_LIMITS.number} characters.` } : stripControl(v)),
  grade(q, a) {
    if (ruled(q)) {
      const x = readRuled(q, a);
      if (x === null) return judged(false);
      const k = Number(q.answer);
      const want = q.decimals === undefined ? k : round(k, q.decimals);
      return judged(Math.abs(x - want) <= 1e-9 * Math.max(1, Math.abs(want)));
    }
    const x = toNumber(a);
    const k = toNumber(q.answer);
    if (!Number.isNaN(x) && !Number.isNaN(k)) return judged(Math.abs(x - k) <= 1e-9 * Math.max(1, Math.abs(k)));
    return judged(normText(a) === normText(q.answer));
  },
  answerText: (_q, a) => a.trim(),
  keyText: (q) => (q.answer && q.format === 'percent' ? `${q.decimals === undefined ? q.answer : round(Number(q.answer), q.decimals).toFixed(q.decimals)}%` : q.decimals !== undefined && q.answer ? round(Number(q.answer), q.decimals).toFixed(q.decimals) : q.answer),
  tags: (q) => (numberRule(q) ? [numberRule(q)] : [])
};
