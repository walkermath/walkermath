// src/lib/server/feedback.ts
// Active Feedback storage (migration 0012): the teacher's mark and message on a student's answer.
// The teacher can give feedback while the delivery runs and after it ends; a student reads only
// their own. Questions are checked against the run's own copy of the lesson (snapshot_json).

import { cleanFeedbackInput, type Feedback, type FeedbackByModule, type FeedbackInput } from '../lesson/feedback.ts';
import { isFeedbackActivity } from '../lesson/modules.ts';
import type { LiveRun } from './live.ts';
import { runSnapshot } from './submissions.ts';

const parse = (s: unknown, fallback: any) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
};

export interface FeedbackRow extends Feedback {
  moduleId: string;
  aliasId: string;
  questionId: string;
}

const toFeedback = (r: any): Feedback => ({ mark: r.mark ?? null, message: r.message ?? '', answer: r.answer ?? '', at: Number(r.updated_at) });

export type FeedbackResult =
  | { ok: true; feedback: FeedbackRow | null }
  | { ok: false; status: number; error: string };

/**
 * Saves (or, with no mark and no message, clears) the teacher's feedback on one answer. The
 * module must be an Active Feedback activity of this run with that question, and the student must
 * be in the run's class. Keeps a copy of the answer as it stands, so a later change shows as revised.
 */
export async function saveFeedback(db: any, run: LiveRun, input: unknown, now = Date.now()): Promise<FeedbackResult> {
  if (run.status === 'scheduled') return { ok: false, status: 409, error: 'This lesson has not started.' };
  const f: FeedbackInput | string = cleanFeedbackInput(input);
  if (typeof f === 'string') return { ok: false, status: 400, error: f };

  const lesson = await runSnapshot(db, run.id);
  const m = (lesson?.modules as any[] | undefined)?.find((x) => x.id === f.moduleId);
  if (!m || !isFeedbackActivity(m) || !(m.config?.questions ?? []).some((q: any) => q.id === f.questionId)) {
    return { ok: false, status: 404, error: 'No such question.' };
  }
  const alias = await db.prepare('SELECT id FROM student_aliases WHERE id = ?1 AND class_id = ?2').bind(f.aliasId, run.classId).first();
  if (!alias) return { ok: false, status: 404, error: 'No such student.' };

  const key = [run.id, f.moduleId, f.aliasId, f.questionId];
  if (!f.mark && !f.message) {
    await db.prepare('DELETE FROM feedback WHERE run_id = ?1 AND module_id = ?2 AND alias_id = ?3 AND question_id = ?4').bind(...key).run();
    return { ok: true, feedback: null };
  }
  const sub = await db
    .prepare('SELECT answers_json FROM submissions WHERE run_id = ?1 AND module_id = ?2 AND alias_id = ?3')
    .bind(run.id, f.moduleId, f.aliasId)
    .first();
  const answer = String(parse(sub?.answers_json, {})?.[f.questionId] ?? '');
  await db
    .prepare(
      `INSERT INTO feedback (run_id, module_id, alias_id, question_id, mark, message, answer, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (run_id, module_id, alias_id, question_id)
       DO UPDATE SET mark = excluded.mark, message = excluded.message, answer = excluded.answer, updated_at = excluded.updated_at`
    )
    .bind(...key, f.mark, f.message, answer, now)
    .run();
  return {
    ok: true,
    feedback: { moduleId: f.moduleId, aliasId: f.aliasId, questionId: f.questionId, mark: f.mark, message: f.message, answer, at: now }
  };
}

/** All the feedback given in a run (the control panel's view). */
export async function runFeedback(db: any, runId: string): Promise<FeedbackRow[]> {
  const { results } = await db
    .prepare('SELECT module_id, alias_id, question_id, mark, message, answer, updated_at FROM feedback WHERE run_id = ?1')
    .bind(runId)
    .all();
  return (results as any[]).map((r) => ({ moduleId: r.module_id, aliasId: r.alias_id, questionId: r.question_id, ...toFeedback(r) }));
}

/** One student's feedback in a run, by module id then question id. */
export async function studentFeedback(db: any, runId: string, aliasId: string): Promise<FeedbackByModule> {
  const { results } = await db
    .prepare('SELECT module_id, question_id, mark, message, answer, updated_at FROM feedback WHERE run_id = ?1 AND alias_id = ?2')
    .bind(runId, aliasId)
    .all();
  const out: FeedbackByModule = {};
  for (const r of results as any[]) (out[r.module_id] ??= {})[r.question_id] = toFeedback(r);
  return out;
}
