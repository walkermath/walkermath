// src/lib/questions/kinds/text.ts
// Short text: matched ignoring case and spacing.

import { stripControl } from '../../lesson/clean.ts';
import { ANSWER_LIMITS, type QuestionKindDef } from '../types.ts';
import { judged, normText } from './shared.ts';

export const text: QuestionKindDef = {
  kind: 'text',
  label: 'short text',
  hint: 'A word or a short phrase. Case and spacing are ignored.',
  keyless: true,
  newQuestion: () => ({ choices: [] }),
  cleanQuestion: () => ({ choices: [] }),
  cleanAnswer: (v) => (v.length > ANSWER_LIMITS.text ? { error: `Keep each answer under ${ANSWER_LIMITS.text} characters.` } : stripControl(v)),
  grade: (q, a) => judged(normText(a) === normText(q.answer)),
  answerText: (_q, a) => a.trim(),
  keyText: (q) => q.answer,
  tags: () => []
};
