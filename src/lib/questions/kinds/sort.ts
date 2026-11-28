// src/lib/questions/kinds/sort.ts
// Card sort: students put each card in a group (sort.ts). The key, each card's group, is in `answer`.

import { cleanSort, cleanSortAnswer, newSort, sortCorrect, sortMarks, sortText } from '../../lesson/sort.ts';
import type { QuestionKindDef } from '../types.ts';
import { judged } from './shared.ts';

export const sort: QuestionKindDef = {
  kind: 'sort',
  label: 'card sort',
  hint: 'Students sort cards into 2 to 6 groups.',
  keyless: false,
  newQuestion: () => ({ choices: [], sort: newSort() }),
  cleanQuestion(raw, _base, ctx) {
    const so = cleanSort(raw?.sort, raw?.answer);
    if (typeof so === 'string') return `${ctx.where}: question ${ctx.n}: ${so}`;
    return { choices: [], answer: so.answer, sort: so.sort };
  },
  cleanAnswer: (v, q) => cleanSortAnswer(v, q.sort) ?? { error: 'Invalid answers.' },
  grade: (q, a) => judged(sortCorrect(q.answer, a), sortMarks(q.answer, a)),
  answerText: (q, a) => sortText(q.sort, a),
  keyText: (q) => sortText(q.sort, q.answer),
  tags: () => []
};
