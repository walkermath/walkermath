// src/lib/server/submissions.ts
// Students' answers in a live lesson (Phase 4b). A student's answers save as they type; the room
// decides whether the module is still open (src/lib/lesson/answers.ts checkSubmission), and the
// answers are checked against the run's own copy of the lesson (snapshot_json), so editing the
// lesson afterwards never changes what a delivery collected or how it was marked.

import { answerSpec, checkSubmission, isCorrect, type Answers, type AnswerSpec } from '../lesson/answers.ts';
import type { RoomState } from '../lesson/room.ts';
import type { Lesson } from './lessons.ts';
import { getLiveRun, roomModules, roomStub, type LiveRun } from './live.ts';
import type { Student } from './sessions.ts';

const parse = (s: unknown, fallback: any) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
};

/** The lesson as it was when the delivery started (answer keys included), or null. */
export async function runSnapshot(db: any, runId: string): Promise<Lesson | null> {
  const row = await db.prepare('SELECT snapshot_json FROM lesson_runs WHERE id = ?1').bind(runId).first();
  const lesson = row?.snapshot_json ? parse(row.snapshot_json, null) : null;
  return lesson && Array.isArray(lesson.modules) ? lesson : null;
}

/** A live run of the student's own class, or null. */
export async function studentRun(db: any, s: Student, runId: unknown): Promise<LiveRun | null> {
  const run = await getLiveRun(db, runId);
  return run && run.classId === s.classId && run.status === 'live' ? run : null;
}

/** The room's current state, read without side effects; null if the room isn't running. */
export async function peekRoom(env: any, runId: string): Promise<RoomState | null> {
  if (!env.LESSON_ROOM) return null;
  const res = await roomStub(env, runId).fetch('https://room.internal/peek');
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { state?: RoomState } | null;
  return data?.state ?? null;
}

export type SaveResult =
  | { ok: true; answers: Answers; updatedAt: number }
  | { ok: false; status: number; error: string; closed?: boolean };

/** Saves a student's answers to one module (the whole set for that module, replacing the last). */
export async function saveAnswers(env: any, s: Student, run: LiveRun, moduleId: unknown, input: unknown, now = Date.now()): Promise<SaveResult> {
  const lesson = await runSnapshot(env.DB, run.id);
  const state = lesson ? await peekRoom(env, run.id) : null;
  if (!lesson || !state) return { ok: false, status: 409, error: 'The lesson is not running.', closed: true };
  const check = checkSubmission(state, roomModules(lesson), moduleId, input, now);
  if (!check.ok) return check;
  await env.DB.prepare(
    `INSERT INTO submissions (run_id, module_id, alias_id, answers_json, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT (run_id, module_id, alias_id) DO UPDATE SET answers_json = excluded.answers_json, updated_at = excluded.updated_at`
  )
    .bind(run.id, moduleId, s.aliasId, JSON.stringify(check.answers), now)
    .run();
  return { ok: true, answers: check.answers, updatedAt: now };
}

/** Everything one student has handed in during a run: { moduleId: { answers, updatedAt } }. */
export async function studentAnswers(db: any, runId: string, aliasId: string): Promise<Record<string, { answers: Answers; updatedAt: number }>> {
  const { results } = await db
    .prepare('SELECT module_id, answers_json, updated_at FROM submissions WHERE run_id = ?1 AND alias_id = ?2')
    .bind(runId, aliasId)
    .all();
  const out: Record<string, { answers: Answers; updatedAt: number }> = {};
  for (const r of results) out[r.module_id] = { answers: parse(r.answers_json, {}), updatedAt: r.updated_at };
  return out;
}

/* ---------------- the teacher's view ---------------- */

export type CollectKind = 'questions' | 'short' | 'tap' | 'coliseum';

export interface CollectModule {
  id: string;
  title: string;
  kind: CollectKind;
  /** Questions with their keys (teacher only). */
  questions?: { id: string; kind: string; text: string; choices: string[]; answer: string }[];
}

export interface AnswerRow {
  moduleId: string;
  aliasId: string;
  alias: string;
  answers: Answers;
  /** questionId -> right / wrong / null (no key, or no answer). */
  correct: Record<string, boolean | null>;
  updatedAt: number;
}

export interface ScoreRow {
  moduleId: string;
  aliasId: string;
  alias: string;
  best: number;
  plays: number;
}

function collectKind(m: { type: string; config: any }): CollectKind | null {
  const spec: AnswerSpec | null = answerSpec(m);
  if (spec) return spec.kind;
  if (m.type === 'activity' && m.config?.category === 'coliseum' && m.config?.coliseumId) return 'coliseum';
  return null;
}

/** What a run collected, module by module, marked against the run's own answer keys. */
export async function runAnswers(db: any, run: LiveRun): Promise<{ modules: CollectModule[]; rows: AnswerRow[]; scores: ScoreRow[] }> {
  const lesson = await runSnapshot(db, run.id);
  if (!lesson) return { modules: [], rows: [], scores: [] };

  const modules: CollectModule[] = [];
  const keys = new Map<string, CollectModule['questions']>();
  for (const m of lesson.modules as any[]) {
    const kind = collectKind(m);
    if (!kind) continue;
    const entry: CollectModule = { id: m.id, title: m.title, kind };
    if (kind === 'questions') {
      entry.questions = (m.config.questions ?? []).map((q: any) => ({
        id: q.id,
        kind: q.kind,
        text: q.text,
        choices: q.choices ?? [],
        answer: q.answer ?? ''
      }));
      keys.set(m.id, entry.questions);
    }
    modules.push(entry);
  }

  const subs = await db
    .prepare(
      `SELECT s.module_id, s.alias_id, a.alias, s.answers_json, s.updated_at
         FROM submissions s JOIN student_aliases a ON a.id = s.alias_id
        WHERE s.run_id = ?1
        ORDER BY a.alias`
    )
    .bind(run.id)
    .all();
  const rows: AnswerRow[] = subs.results.map((r: any) => {
    const answers: Answers = parse(r.answers_json, {});
    const correct: Record<string, boolean | null> = {};
    for (const q of keys.get(r.module_id) ?? []) correct[q.id] = isCorrect(q, answers[q.id]);
    return { moduleId: r.module_id, aliasId: r.alias_id, alias: r.alias, answers, correct, updatedAt: r.updated_at };
  });

  const sc = await db
    .prepare(
      `SELECT ls.module_id, ls.alias_id, a.alias, MAX(ls.score) AS best, COUNT(*) AS plays
         FROM lesson_scores ls JOIN student_aliases a ON a.id = ls.alias_id
        WHERE ls.run_id = ?1 AND ls.module_id IS NOT NULL
        GROUP BY ls.module_id, ls.alias_id
        ORDER BY a.alias`
    )
    .bind(run.id)
    .all();
  const scores: ScoreRow[] = sc.results.map((r: any) => ({
    moduleId: r.module_id,
    aliasId: r.alias_id,
    alias: r.alias,
    best: Number(r.best),
    plays: Number(r.plays)
  }));
  return { modules, rows, scores };
}

/** A Coliseum module of a live run of the student's class, for tagging a game score; else null. */
export async function scoreTarget(db: any, s: Student, runId: unknown, moduleId: unknown): Promise<{ runId: string; moduleId: string } | null> {
  if (typeof moduleId !== 'string' || moduleId.length > 64) return null;
  const run = await studentRun(db, s, runId);
  if (!run) return null;
  const lesson = await runSnapshot(db, run.id);
  const m = lesson?.modules.find((x: any) => x.id === moduleId) as any;
  return m && m.type === 'activity' && m.config?.category === 'coliseum' ? { runId: run.id, moduleId } : null;
}
