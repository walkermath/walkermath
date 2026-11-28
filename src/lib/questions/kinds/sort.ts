// src/lib/questions/kinds/sort.ts
// Card sort: students put each card in a group (sort.ts). The key, each card's group, is in `answer`.

import { parseList } from '../../lesson/grid.ts';
import { cleanSort, cleanSortAnswer, newSort, sortCorrect, sortMarks, sortText } from '../../lesson/sort.ts';
import type { QuestionKindDef } from '../types.ts';
import { judged, partialGrade } from './shared.ts';

export const sort: QuestionKindDef = {
  kind: 'sort',
  label: 'card sort',
  hint: 'Students sort cards into 2 to 6 groups.',
  keyless: false,
  newQuestion: () => ({ choices: [], sort: newSort() }),
  cleanQuestion(raw, _base, ctx) {
    const so = cleanSort(raw?.sort, raw?.answer);
    if (typeof so === 'string') return `${ctx.where}: question ${ctx.n}: ${so}`;
    return { choices: [], answer: so.answer, sort: so.sort, ...(raw?.partial === true ? { partial: true } : {}) };
  },
  cleanAnswer: (v, q) => cleanSortAnswer(v, q.sort) ?? { error: 'Invalid answers.' },
  grade(q, a) {
    const whole = sortCorrect(q.answer, a);
    const parts = sortMarks(q.answer, a);
    if (!q.partial) return judged(whole, parts);
    const keyed = parseList(q.answer).flatMap((k, i) => (k ? [i] : []));
    return partialGrade(whole, parts, keyed);
  },
  answerText: (q, a) => sortText(q.sort, a),
  keyText: (q) => sortText(q.sort, q.answer),
  tags: (q) => (q.partial ? ['partial credit'] : [])
};
