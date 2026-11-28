// src/lib/questions/kinds/text.ts
// Short text: matched ignoring case and spacing, against the key or any other accepted answer.

import { cleanLine, stripControl } from '../../lesson/clean.ts';
import { ANSWER_LIMITS, QUESTION_LIMITS, type QuestionKindDef } from '../types.ts';
import { judged, normText } from './shared.ts';

export const text: QuestionKindDef = {
  kind: 'text',
  label: 'short text',
  hint: 'A word or a short phrase. Case and spacing are ignored; you can accept more than one answer.',
  keyless: true,
  newQuestion: () => ({ choices: [] }),
  cleanQuestion(raw, base, ctx) {
    if (ctx.keyless || !base.answer) return { choices: [] };
    const alts: string[] = [];
    for (const a of Array.isArray(raw?.alts) ? raw.alts : []) {
      const t = cleanLine(a, QUESTION_LIMITS.answer);
      if (t && normText(t) !== normText(base.answer) && !alts.some((x) => normText(x) === normText(t))) alts.push(t);
      if (alts.length >= QUESTION_LIMITS.alts) break;
    }
    return { choices: [], ...(alts.length ? { alts } : {}) };
  },
  cleanAnswer: (v) => (v.length > ANSWER_LIMITS.text ? { error: `Keep each answer under ${ANSWER_LIMITS.text} characters.` } : stripControl(v)),
  grade: (q, a) => judged([q.answer, ...(q.alts ?? [])].some((k) => normText(a) === normText(k))),
  answerText: (_q, a) => a.trim(),
  keyText: (q) => (q.alts?.length ? `${q.answer} (also: ${q.alts.join(', ')})` : q.answer),
  tags: (q) => (q.alts?.length ? [`${q.alts.length + 1} accepted answers`] : [])
};
