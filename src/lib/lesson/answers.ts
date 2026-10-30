// src/lib/lesson/answers.ts
// What students hand in during a live lesson, and the rules for it. Pure functions: the live room
// (live-worker/) and the Pages Functions use them to check a submission, the screens use them to
// draw the form, the ticks and the control panel's answer table.
//
// A module takes one of three kinds of answer, from its (student-safe) config:
//   questions  a prompt: one answer per question, keyed by the question's id
//   short      independent work set to "short answer": one text, keyed 'short'
//   tap        an activity's or independent work's "done" button: { done: '1' }
// Answers are stored as { key: text }. Choice answers are the chosen index as text ('0', '1', ...).

import { answersOpen, type RoomModule, type RoomState } from './room.ts';

export const ANSWER_LIMITS = {
  text: 500,
  number: 40,
  short: 1000,
  keys: 50
} as const;

export type Answers = Record<string, string>;

export type AnswerSpec =
  | { kind: 'questions'; questions: { id: string; kind: 'text' | 'number' | 'choice'; text: string; choices: string[] }[] }
  | { kind: 'short' }
  | { kind: 'tap' };

/** What a module takes from students, or null if it takes nothing. Works on public or full configs. */
export function answerSpec(m: { type: string; config: any }): AnswerSpec | null {
  const c = m.config ?? {};
  switch (m.type) {
    case 'prompt':
      return Array.isArray(c.questions) && c.questions.length ? { kind: 'questions', questions: c.questions } : null;
    case 'independent':
      return c.response === 'short' ? { kind: 'short' } : c.response === 'done' ? { kind: 'tap' } : null;
    case 'activity':
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

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

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
      out.short = v.replace(CONTROL, '');
    }
    return out;
  }
  const byId = new Map(spec.questions.map((q) => [q.id, q]));
  for (const [k, v] of entries) {
    const q = byId.get(k);
    if (!q || typeof v !== 'string') return 'Invalid answers.';
    if (q.kind === 'choice') {
      if (v !== '' && !(/^\d{1,2}$/.test(v) && Number(v) < q.choices.length)) return 'Invalid answers.';
      out[k] = v;
    } else {
      const max = q.kind === 'number' ? ANSWER_LIMITS.number : ANSWER_LIMITS.text;
      if (v.length > max) return `Keep each answer under ${max} characters.`;
      out[k] = v.replace(CONTROL, '');
    }
  }
  return out;
}

export type SubmissionCheck =
  | { ok: true; index: number; answers: Answers }
  | { ok: false; status: number; error: string; closed?: boolean };

/**
 * The room's decision on a student's submission: the module must exist, take answers, and be open
 * (its clock running, not paused, or just stopped).
 */
export function checkSubmission(state: RoomState, modules: RoomModule[], moduleId: unknown, input: unknown, now: number): SubmissionCheck {
  if (state.status !== 'live') return { ok: false, status: 409, error: 'The lesson is over.', closed: true };
  const index = typeof moduleId === 'string' ? modules.findIndex((m) => m.id === moduleId) : -1;
  if (index < 0) return { ok: false, status: 404, error: 'No such module.' };
  const spec = answerSpec(modules[index]);
  if (!spec) return { ok: false, status: 400, error: 'This module does not take answers.' };
  if (!answersOpen(state, index, now)) {
    return { ok: false, status: 409, error: 'This module is closed. Your earlier answers are saved.', closed: true };
  }
  const answers = cleanAnswers(spec, input);
  if (typeof answers === 'string') return { ok: false, status: 400, error: answers };
  return { ok: true, index, answers };
}

/* ---------------- checking against the teacher's key ---------------- */

/** "1,000" -> 1000, "3/4" -> 0.75, " -2.5 " -> -2.5; NaN if it isn't a number. */
export function toNumber(s: string): number {
  const t = s.trim().replace(/,/g, '').replace(/\s+/g, '');
  if (/^[-+]?\d+(\.\d+)?$/.test(t) || /^[-+]?\.\d+$/.test(t)) return Number(t);
  const f = /^([-+]?\d+)\/(\d+)$/.exec(t);
  return f && Number(f[2]) !== 0 ? Number(f[1]) / Number(f[2]) : NaN;
}

/** true / false against the question's key, or null when there is no key (or no answer to judge). */
export function isCorrect(q: { kind: string; answer: string }, answer: string | undefined): boolean | null {
  if (!q.answer) return null;
  if (answer === undefined || answer.trim() === '') return null;
  if (q.kind === 'choice') return answer === q.answer;
  if (q.kind === 'number') {
    const a = toNumber(answer);
    const k = toNumber(q.answer);
    if (!Number.isNaN(a) && !Number.isNaN(k)) return Math.abs(a - k) <= 1e-9 * Math.max(1, Math.abs(k));
  }
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(answer) === norm(q.answer);
}
