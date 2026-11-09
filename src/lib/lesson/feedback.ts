// src/lib/lesson/feedback.ts
// Active Feedback: the teacher marks a student's answer to one question (✓ right, ◐ partly right,
// ✗ not right yet) and/or sends a short plain-text message. Pure helpers shared by the server, the
// control panel and the student view. Storage is src/lib/server/feedback.ts.

export const MARKS = ['right', 'partial', 'wrong'] as const;
export type Mark = (typeof MARKS)[number];
export const isMark = (v: unknown): v is Mark => typeof v === 'string' && (MARKS as readonly string[]).includes(v);

export const FEEDBACK_MESSAGE_MAX = 400;

export const MARK_SYMBOL: Record<Mark, string> = { right: '✓', partial: '◐', wrong: '✗' };
/** How a mark reads to the student. */
export const MARK_LABEL: Record<Mark, string> = { right: 'right', partial: 'partly right', wrong: 'not right yet' };
/** What each mark counts for in a report's score: right 1, partly right a half, not right yet 0. */
export const MARK_POINTS: Record<Mark, number> = { right: 1, partial: 0.5, wrong: 0 };
/** How a mark reads in a report. */
export const MARK_REPORT: Record<Mark, string> = { right: 'Right', partial: 'Partly right', wrong: 'Not right yet' };

/** The site's colour slot for each mark. */
export const MARK_COLOR: Record<Mark, string> = { right: 'var(--ok)', partial: 'var(--warn)', wrong: 'var(--bad)' };

/** One piece of feedback on one answer. `answer` is the answer as it was when marked. */
export interface Feedback {
  mark: Mark | null;
  message: string;
  answer: string;
  at: number;
}

/** Feedback for one student, by module id then question id. */
export type FeedbackByModule = Record<string, Record<string, Feedback>>;

export interface FeedbackInput {
  moduleId: string;
  aliasId: string;
  questionId: string;
  mark: Mark | null;
  message: string;
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/** The teacher's request, checked; or an error message. An empty mark and message means "clear it". */
export function cleanFeedbackInput(input: unknown): FeedbackInput | string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Invalid request.';
  const b = input as Record<string, unknown>;
  if (!isId(b.moduleId) || !isId(b.aliasId) || !isId(b.questionId)) return 'Invalid request.';
  if (b.mark !== null && b.mark !== undefined && b.mark !== '' && !isMark(b.mark)) return 'Invalid mark.';
  if (b.message !== undefined && typeof b.message !== 'string') return 'Invalid message.';
  const message = String(b.message ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
  if (message.length > FEEDBACK_MESSAGE_MAX) return `Keep the message under ${FEEDBACK_MESSAGE_MAX} characters.`;
  return { moduleId: b.moduleId, aliasId: b.aliasId, questionId: b.questionId, mark: isMark(b.mark) ? b.mark : null, message };
}

/** The student changed this answer after it was marked. */
export const isRevised = (fb: Feedback | undefined, current: string | undefined): boolean =>
  !!fb && (fb.mark !== null || fb.message !== '') && fb.answer.trim() !== (current ?? '').trim();
