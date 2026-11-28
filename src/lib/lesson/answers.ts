// src/lib/lesson/answers.ts
// What students hand in during a live lesson, and the rules for it. Pure functions: the live room
// (src/worker/) and the /api handlers use them to check a submission, the screens use them to
// draw the form, the ticks and the control panel's answer table.
//
// A module takes one of three kinds of answer, from its (student-safe) config:
//   questions  a prompt, or an Active Feedback activity: one answer per question, keyed by the question's id
//   short      independent work set to "short answer": one text, keyed 'short'
//   tap        an activity's or independent work's "done" button: { done: '1' }
// Answers are stored as { key: text }. Choice answers are the chosen index as text ('0', '1', ...).

// Each question's own rules (what a valid answer is, how it's graded) live in the question
// registry, src/lib/questions/. This file decides only what a module takes and when.

import { stripControl } from './clean.ts';
import { ANSWER_LIMITS, cleanAnswer, questionsOf, type Question } from '../questions/index.ts';
import { answersOpen, type RoomModule, type RoomState } from './room.ts';

export { ANSWER_LIMITS, isCorrect, toNumber } from '../questions/index.ts';

export type Answers = Record<string, string>;

export type AnswerSpec =
  | { kind: 'questions'; questions: Question[] }
  | { kind: 'short' }
  | { kind: 'tap' };

/** What a module takes from students, or null if it takes nothing. Works on public or full configs. */
export function answerSpec(m: { type: string; config: any }): AnswerSpec | null {
  const c = m.config ?? {};
  switch (m.type) {
    case 'prompt':
      return questionsOf(m).length ? { kind: 'questions', questions: questionsOf(m) } : null;
    case 'independent':
      return c.response === 'short' ? { kind: 'short' } : c.response === 'done' ? { kind: 'tap' } : null;
    case 'activity':
      // Active Feedback: questions with no key, marked by the teacher (a "done" tap never applies).
      if (c.category === 'feedback') return questionsOf(m).length ? { kind: 'questions', questions: questionsOf(m) } : null;
      return c.doneTap ? { kind: 'tap' } : null;
    default:
      return null;
  }
}

/** Has the student handed in anything? (An empty form doesn't count; a tap does.) */
export function isAnswered(spec: AnswerSpec, a: Answers | undefined): boolean {
  if (!a) return false;
  if (spec.kind === 'tap') return a.done === '1';
  return Object.values(a).some((v) => typeof v === 'string' && v.trim() !== '');
}

/** Checks a student's answers against the module; returns the cleaned answers or an error message. */
export function cleanAnswers(spec: AnswerSpec, input: unknown): Answers | string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Invalid answers.';
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > ANSWER_LIMITS.keys) return 'Too many answers.';
  const out: Answers = {};

  if (spec.kind === 'tap') {
    for (const [k, v] of entries) {
      if (k !== 'done' || (v !== '1' && v !== '')) return 'Invalid answers.';
      out.done = v;
    }
    return out;
  }
  if (spec.kind === 'short') {
    for (const [k, v] of entries) {
      if (k !== 'short' || typeof v !== 'string') return 'Invalid answers.';
      if (v.length > ANSWER_LIMITS.short) return `Keep it under ${ANSWER_LIMITS.short} characters.`;
      out.short = stripControl(v);
    }
    return out;
  }
  const byId = new Map(spec.questions.map((q) => [q.id, q]));
  for (const [k, v] of entries) {
    const q = byId.get(k);
    if (!q) return 'Invalid answers.';
    const a = cleanAnswer(q, v);
    if (typeof a !== 'string') return a.error;
    out[k] = a;
  }
  return out;
}

export type SubmissionCheck =
  | { ok: true; index: number; answers: Answers }
  | { ok: false; status: number; error: string; closed?: boolean };

/**
 * The room's decision on a student's submission: the module must exist, take answers, and be open
 * (its clock running, not paused, or just stopped; or, before the lesson, an early Bellwork).
 */
export function checkSubmission(state: RoomState, modules: RoomModule[], moduleId: unknown, input: unknown, now: number): SubmissionCheck {
  if (state.status === 'ended') return { ok: false, status: 409, error: 'The lesson is over.', closed: true };
  const index = typeof moduleId === 'string' ? modules.findIndex((m) => m.id === moduleId) : -1;
  if (index < 0) return { ok: false, status: 404, error: 'No such module.' };
  const spec = answerSpec(modules[index]);
  if (!spec) return { ok: false, status: 400, error: 'This module does not take answers.' };
  if (!answersOpen(state, index, now)) {
    if (state.status === 'waiting') return { ok: false, status: 409, error: "The lesson hasn't started yet." };
    return { ok: false, status: 409, error: 'This module is closed. Your earlier answers are saved.', closed: true };
  }
  const answers = cleanAnswers(spec, input);
  if (typeof answers === 'string') return { ok: false, status: 400, error: answers };
  return { ok: true, index, answers };
}
