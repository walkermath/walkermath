// src/lib/questions/kinds/math.ts
// Algebra: checked by mathcheck.ts. 'form' (default) = same form, any order: (x+5)(x+2) matches
// (x+2)(x+5), but x + 5 = 12 doesn't match x = 7. 'any' = any equivalent form.

import { checkMath, readMath } from '../../lesson/mathcheck.ts';
import { stripControl } from '../../lesson/clean.ts';
import { ANSWER_LIMITS, type QuestionKindDef } from '../types.ts';
import { judged } from './shared.ts';

export const math: QuestionKindDef = {
  kind: 'math',
  label: 'math',
  hint: 'An expression or equation, checked by its algebra: same form any order, or any equivalent form.',
  keyless: true,
  newQuestion: () => ({ choices: [], match: 'form' }),
  cleanQuestion(raw, base, ctx) {
    if (base.answer) {
      const read = readMath(base.answer);
      if (!read.ok) return `${ctx.where}: the answer to question ${ctx.n} can't be read (${read.error})`;
    }
    return { choices: [], ...(ctx.keyless ? {} : { match: raw?.match === 'any' ? ('any' as const) : ('form' as const) }) };
  },
  cleanAnswer: (v) => (v.length > ANSWER_LIMITS.math ? { error: `Keep each answer under ${ANSWER_LIMITS.math} characters.` } : stripControl(v)),
  grade: (q, a) => judged(checkMath(q.answer, a, q.match === 'any' ? 'any' : 'form')),
  answerText: (_q, a) => a.trim(),
  keyText: (q) => q.answer,
  tags: (q) => (q.answer ? [q.match === 'any' ? 'any equivalent form' : 'same form, any order'] : [])
};
