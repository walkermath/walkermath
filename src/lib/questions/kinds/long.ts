// src/lib/questions/kinds/long.ts
// Long answer: a few sentences or an explanation, graded by the teacher (and later, if it's turned
// on, suggested by the AI grader). It has no key; an optional rubric says what full credit needs.
// Its grade is "pending" until a grade is given (src/lib/questions/score.ts).

import { cleanText, stripControl } from '../../lesson/clean.ts';
import { ANSWER_LIMITS, QUESTION_LIMITS, type QuestionKindDef } from '../types.ts';

export const long: QuestionKindDef = {
  kind: 'long',
  label: 'long answer',
  hint: 'A few sentences or an explanation. You grade it after class, with points and a comment.',
  keyless: true,
  teacherGraded: true,
  newQuestion: () => ({ choices: [] }),
  cleanQuestion(raw, _base, ctx) {
    const rubric = ctx.keyless ? '' : cleanText(raw?.rubric, QUESTION_LIMITS.rubric);
    return { choices: [], answer: '', ...(rubric ? { rubric } : {}) };
  },
  cleanAnswer: (v) => (v.length > ANSWER_LIMITS.long ? { error: `Keep each answer under ${ANSWER_LIMITS.long} characters.` } : stripControl(v)),
  grade: () => ({ status: 'pending', score: 0, max: 1, source: 'teacher' }),
  answerText: (_q, a) => a.trim(),
  keyText: () => '',
  tags: (q) => ['graded by you', ...(q.rubric ? ['rubric'] : [])]
};
