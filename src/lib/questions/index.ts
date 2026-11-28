// src/lib/questions/index.ts
// The question handler: one registry that every question kind hooks into. Each kind
// (src/lib/questions/kinds/*.ts) says how a new question starts, how the teacher's question and
// key are checked, how a student's answer is checked, how it's graded, and how answers and keys
// read as text. Everything else (lesson validation, the room, marks, the answers table, reports,
// exports) goes through the functions here, so adding a kind is one file plus its editor and
// input widget (src/components/questions/).
//
// Pure functions, no Svelte, safe on the server, in the room and in the browser. Answer keys are
// still private: they're split out before storage (modules.ts) and graded against the run's
// snapshot on the server.

import { cleanLine, cleanText, isUuid, newUuid } from '../lesson/clean.ts';
import { choice } from './kinds/choice.ts';
import { grid } from './kinds/grid.ts';
import { math } from './kinds/math.ts';
import { number } from './kinds/number.ts';
import { sort } from './kinds/sort.ts';
import { text } from './kinds/text.ts';
import { QUESTION_LIMITS, type Grade, type Question, type QuestionKind, type QuestionKindDef, type QuestionMark } from './types.ts';

export * from './types.ts';
export { toNumber } from './kinds/number.ts';

/** Every kind, in the order the editor offers them. */
export const QUESTION_KINDS: Record<QuestionKind, QuestionKindDef> = { text, number, math, grid, sort, choice };
export const QUESTION_KIND_LIST = Object.keys(QUESTION_KINDS) as QuestionKind[];
/** Kinds an Active Feedback activity can ask (teacher-marked, so no key). */
export const KEYLESS_KINDS = QUESTION_KIND_LIST.filter((k) => QUESTION_KINDS[k].keyless);

export const isQuestionKind = (v: unknown): v is QuestionKind => typeof v === 'string' && v in QUESTION_KINDS;
/** A kind's definition; unknown kinds read as short text (how old or odd data has always been treated). */
export const kindOf = (k: unknown): QuestionKindDef => (isQuestionKind(k) ? QUESTION_KINDS[k] : text);

/* ---------------- the teacher's side ---------------- */

export function newQuestion(kind: QuestionKind = 'text'): Question {
  return { id: newUuid(), kind, text: '', answer: '', choices: [], ...QUESTION_KINDS[kind].newQuestion() } as Question;
}

/**
 * One question from the teacher, checked: the question, or an error message. `keyless`
 * (Active Feedback): only keyless kinds, and no key or matching rule is kept.
 */
export function cleanQuestion(raw: any, where: string, n: number, keyless = false, allowed?: readonly QuestionKind[]): Question | string {
  const kinds = allowed ?? (keyless ? KEYLESS_KINDS : QUESTION_KIND_LIST);
  const kind: QuestionKind = kinds.includes(raw?.kind) ? raw.kind : 'text';
  const def = QUESTION_KINDS[kind];
  const qtext = cleanText(raw?.text, QUESTION_LIMITS.text);
  if (!qtext) return `${where}: question ${n} is empty.`;
  const base = { text: qtext, answer: keyless ? '' : cleanLine(raw?.answer, QUESTION_LIMITS.answer) };
  const own = def.cleanQuestion(raw, base, { where, n, keyless });
  if (typeof own === 'string') return own;
  const q: Question = { id: isUuid(raw?.id) ? raw.id : newUuid(), kind, text: qtext, choices: [], answer: base.answer, ...own } as Question;
  if (keyless) {
    q.answer = '';
    delete q.match;
  }
  return q;
}

/** A list of questions, checked. */
export function cleanQuestions(v: unknown, where: string, keyless: boolean, max: number): Question[] | string {
  const qs = Array.isArray(v) ? v : [];
  if (qs.length > max) return `${where}: at most ${max} questions.`;
  const out: Question[] = [];
  for (const [i, raw] of qs.entries()) {
    const q = cleanQuestion(raw, where, i + 1, keyless);
    if (typeof q === 'string') return q;
    out.push(q);
  }
  return out;
}

/* ---------------- the student's side ---------------- */

/** A student's answer to one question: the cleaned text, or an error message. */
export function cleanAnswer(q: Question, value: unknown): string | { error: string } {
  if (typeof value !== 'string') return { error: 'Invalid answers.' };
  return kindOf(q.kind).cleanAnswer(value, q);
}

/* ---------------- grading ---------------- */

const UNKEYED: Grade = { status: 'unkeyed', score: 0, max: 1, source: 'auto' };
const BLANK: Grade = { status: 'blank', score: 0, max: 1, source: 'auto' };

/** The one way an answer is graded. Runs against the full question (key included): server side, or the teacher's own preview. */
export function gradeAnswer(q: Question, answer: string | undefined): Grade {
  if (!q?.answer) return UNKEYED;
  if (answer === undefined || answer.trim() === '') return BLANK;
  return kindOf(q.kind).grade(q, answer);
}

/** A grade as the ✓ / ✗ marks show it: true, false, or null (no key, nothing to judge, not graded yet). */
export function markOf(g: Grade): boolean | null {
  if (g.status === 'right') return true;
  if (g.status === 'wrong' || g.status === 'partial') return false;
  return null;
}

/** A grade as students and the answers table see it: ✓, ✗, not marked, or partly right (the share right). */
export function studentMark(g: Grade): QuestionMark {
  if (g.status === 'partial') return g.max ? Math.round((g.score / g.max) * 100) / 100 : false;
  return markOf(g);
}

/** The mark for one answer (see studentMark). */
export const questionMark = (q: Question, answer: string | undefined): QuestionMark => studentMark(gradeAnswer(q, answer));

/** true / false against the key, or null. The ✓ / ✗ count (a partly right answer counts as not right). */
export const isCorrect = (q: Question, answer: string | undefined): boolean | null => markOf(gradeAnswer(q, answer));

/* ---------------- as text ---------------- */

/** A stored answer as people read it, or null when there's none. */
export function answerText(q: Question, answer: string | undefined): string | null {
  if (answer === undefined || answer.trim() === '') return null;
  return kindOf(q.kind).answerText(q, answer);
}

/** The key as people read it ('' when there's none). `short`: a choice's letter only. */
export function keyText(q: Question, opts: { short?: boolean } = {}): string {
  if (!q?.answer) return '';
  if (opts.short && q.kind === 'choice') return String.fromCharCode(65 + Number(q.answer));
  return kindOf(q.kind).keyText(q);
}

/** Short labels for a question card: its kind, then the kind's own ("any equivalent form"). */
export const questionTags = (q: Question): string[] => kindOf(q.kind).tags(q);

/* ---------------- modules ---------------- */

/**
 * The questions a module asks, or [] if it asks none: a prompt (Bellwork, Check-in, Exit ticket),
 * or an Active Feedback activity. The one answer to "does this module have questions?"
 */
export function questionsOf(m: { type: string; config: any } | null | undefined): Question[] {
  const c = m?.config;
  if (!c || !Array.isArray(c.questions)) return [];
  if (m!.type === 'prompt' || (m!.type === 'activity' && c.category === 'feedback')) return c.questions;
  return [];
}
