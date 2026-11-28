// src/lib/questions/kinds/grid.ts
// A table or area model with blanks to fill (grid.ts). Keys are per blank, in `answer` as JSON.

import { blankPositions, cleanGrid, cleanGridAnswer, gridCorrect, gridMarks, gridText, newGrid, parseList } from '../../lesson/grid.ts';
import type { QuestionKindDef } from '../types.ts';
import { judged, partialGrade } from './shared.ts';

export const grid: QuestionKindDef = {
  kind: 'grid',
  label: 'grid',
  hint: 'A table or area model with blanks to fill in.',
  keyless: false,
  newQuestion: () => ({ choices: [], match: 'form', grid: newGrid() }),
  cleanQuestion(raw, _base, ctx) {
    const g = cleanGrid(raw?.grid, raw?.answer);
    if (typeof g === 'string') return `${ctx.where}: question ${ctx.n}: ${g}`;
    return { choices: [], answer: g.answer, grid: g.grid, match: raw?.match === 'any' ? ('any' as const) : ('form' as const), ...(raw?.partial === true ? { partial: true } : {}) };
  },
  cleanAnswer: (v, q) => cleanGridAnswer(v, q.grid ? blankPositions(q.grid).length : 0) ?? { error: 'Invalid answers.' },
  grade(q, a) {
    const match = q.match === 'any' ? 'any' : 'form';
    const whole = gridCorrect(q.answer, a, match, q.grid);
    const parts = gridMarks(q.answer, a, match, q.grid);
    if (!q.partial || !q.grid) return judged(whole, parts);
    // Which blanks count: keyed ones; in an area model, the products (headers aren't marked one by one).
    const counted =
      q.grid.check === 'area'
        ? blankPositions(q.grid).flatMap(([r, c], i) => (r > 0 && c > 0 ? [i] : []))
        : parseList(q.answer).flatMap((k, i) => (k.trim() ? [i] : []));
    return partialGrade(whole, parts, counted);
  },
  answerText: (_q, a) => gridText(a),
  keyText: (q) => gridText(q.answer),
  tags: (q) => [
    ...(q.grid?.check === 'area' ? ['area model'] : q.answer ? [q.match === 'any' ? 'any equivalent form' : 'same form, any order'] : []),
    ...(q.partial ? ['partial credit'] : [])
  ]
};
