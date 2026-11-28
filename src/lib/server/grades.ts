// src/lib/server/grades.ts
// Grading after class (migration 0016): the teacher's points and comments on long answers, and
// overrides of automatic marks ("give credit"), plus "release scores" per delivery and module.
// Scoring itself is src/lib/questions/score.ts; this file is storage and the two teacher views
// built on it: the grading screen for one lesson, and the to-grade list across lessons.
//
// Active Feedback activities are not graded here: their marks are given live and go to students
// right away (src/lib/server/feedback.ts). They still count in scores, through scoreModule.

import { isFeedbackActivity } from '../lesson/modules.ts';
import { pointsOf, questionsOf, type Question } from '../questions/index.ts';
import { isHandGraded, scoreModule, type StoredGrade } from '../questions/score.ts';

export const GRADE_COMMENT_MAX = 400;
/** Grades saved in one request (a whole group of the same answer, say). */
export const GRADES_PER_SAVE = 200;

const parse = (s: unknown, fallback: any) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
};
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
/** An id list as one bound value (`IN (SELECT value FROM json_each(?n))`), so any number of ids fits D1's 100-value limit. */
const IN = (n: number) => `IN (SELECT value FROM json_each(?${n}))`;

/** The modules a teacher grades after class: ones with questions, except Active Feedback. */
export const gradedModules = (lesson: any): any[] => (lesson?.modules ?? []).filter((m: any) => questionsOf(m).length && !isFeedbackActivity(m));

export interface GradeRow extends StoredGrade {
  runId: string;
  moduleId: string;
  aliasId: string;
}

const toRow = (r: any): GradeRow => ({
  runId: r.run_id,
  moduleId: r.module_id,
  aliasId: r.alias_id,
  questionId: r.question_id,
  score: Number(r.score),
  max: Number(r.max),
  comment: r.comment ?? '',
  source: r.source === 'llm' ? 'llm' : 'teacher',
  answer: r.answer ?? '',
  at: Number(r.updated_at)
});

export async function gradesForRuns(db: any, runIds: string[]): Promise<GradeRow[]> {
  if (!runIds.length) return [];
  const { results } = await db.prepare(`SELECT * FROM grades WHERE run_id ${IN(1)}`).bind(JSON.stringify(runIds)).all();
  return (results as any[]).map(toRow);
}

/** Released modules: "runId|moduleId" -> when. */
export async function releasesForRuns(db: any, runIds: string[]): Promise<Map<string, number>> {
  if (!runIds.length) return new Map();
  const { results } = await db.prepare(`SELECT * FROM grade_releases WHERE run_id ${IN(1)}`).bind(JSON.stringify(runIds)).all();
  return new Map((results as any[]).map((r) => [`${r.run_id}|${r.module_id}`, Number(r.released_at)]));
}

/** One student's released grades in a run: module id -> question id -> grade. Unreleased modules are left out. */
export async function studentGrades(db: any, runId: string, aliasId: string): Promise<Record<string, Record<string, StoredGrade>>> {
  const { results } = await db
    .prepare(
      `SELECT g.* FROM grades g JOIN grade_releases r ON r.run_id = g.run_id AND r.module_id = g.module_id
       WHERE g.run_id = ?1 AND g.alias_id = ?2`
    )
    .bind(runId, aliasId)
    .all();
  const out: Record<string, Record<string, StoredGrade>> = {};
  for (const r of results as any[]) (out[r.module_id] ??= {})[r.question_id] = toRow(r);
  return out;
}

/** Module ids released in a run. */
export async function releasedModules(db: any, runId: string): Promise<Set<string>> {
  return new Set([...(await releasesForRuns(db, [runId])).keys()].map((k) => k.split('|')[1]));
}

/* ---------------- saving ---------------- */

export interface GradeInput {
  runId: string;
  moduleId: string;
  aliasId: string;
  questionId: string;
  /** Points given, or null to clear the grade (back to the automatic one, or ungraded). */
  score: number | null;
  comment: string;
}

export function cleanGradeInputs(v: unknown): GradeInput[] | string {
  if (!Array.isArray(v) || !v.length) return 'Nothing to save.';
  if (v.length > GRADES_PER_SAVE) return `At most ${GRADES_PER_SAVE} grades at once.`;
  const out: GradeInput[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') return 'Invalid request.';
    const b = raw as Record<string, unknown>;
    if (!isId(b.runId) || !isId(b.moduleId) || !isId(b.aliasId) || !isId(b.questionId)) return 'Invalid request.';
    const score = b.score === null || b.score === undefined || b.score === '' ? null : Number(b.score);
    if (score !== null && (!Number.isFinite(score) || score < 0)) return 'Points must be a number, 0 or more.';
    if (b.comment !== undefined && typeof b.comment !== 'string') return 'Invalid comment.';
    const comment = String(b.comment ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
    if (comment.length > GRADE_COMMENT_MAX) return `Keep each comment under ${GRADE_COMMENT_MAX} characters.`;
    out.push({ runId: b.runId, moduleId: b.moduleId, aliasId: b.aliasId, questionId: b.questionId, score, comment });
  }
  return out;
}

export type SaveResult = { ok: true; saved: GradeRow[]; cleared: number } | { ok: false; status: number; error: string };

/**
 * Saves grades for deliveries of one of the teacher's lessons. Each must be a graded module of
 * that delivery's own copy of the lesson, with that question, for a student in its class. Points
 * are capped at the question's worth. A null score clears the grade (back to the automatic mark,
 * or ungraded for a long answer): a comment goes with points, never alone.
 */
export async function saveGrades(db: any, teacherId: string, lessonId: string, inputs: GradeInput[], now = Date.now()): Promise<SaveResult> {
  const runIds = [...new Set(inputs.map((g) => g.runId))];
  if (runIds.length > 40) return { ok: false, status: 400, error: 'Too many deliveries at once.' };
  const { results: runs } = await db
    .prepare(
      `SELECT r.id, r.class_id, r.status, r.snapshot_json FROM lesson_runs r JOIN lessons l ON l.id = r.lesson_id
       WHERE l.teacher_id = ?1 AND l.id = ?2 AND r.id ${IN(3)}`
    )
    .bind(teacherId, lessonId, JSON.stringify(runIds))
    .all();
  const byRun = new Map<string, { classId: string; status: string; lesson: any }>(
    (runs as any[]).map((r) => [r.id, { classId: r.class_id, status: r.status, lesson: parse(r.snapshot_json, null) }])
  );
  // Students and answers by delivery (a handful of deliveries, so the id lists stay short).
  const found = [...byRun.keys()];
  const classIds = [...new Set([...byRun.values()].map((r) => r.classId))];
  const [aliasRows, subs] = await Promise.all([
    classIds.length ? db.prepare(`SELECT id, class_id FROM student_aliases WHERE class_id ${IN(1)}`).bind(JSON.stringify(classIds)).all() : { results: [] },
    submissionsForRuns(db, found)
  ]);
  const aliasClass = new Map((aliasRows.results as any[]).map((a) => [a.id, a.class_id]));
  const answers = new Map(subs.map((x) => [`${x.runId}|${x.moduleId}|${x.aliasId}`, x.answers as Record<string, string>]));

  const stmts: any[] = [];
  const saved: GradeRow[] = [];
  let cleared = 0;
  for (const g of inputs) {
    const run = byRun.get(g.runId);
    if (!run || run.status === 'scheduled' || !run.lesson) return { ok: false, status: 404, error: 'No such delivery.' };
    const m = gradedModules(run.lesson).find((x: any) => x.id === g.moduleId);
    const q: Question | undefined = m && questionsOf(m).find((x) => x.id === g.questionId);
    if (!q) return { ok: false, status: 404, error: 'No such question.' };
    if (aliasClass.get(g.aliasId) !== run.classId) return { ok: false, status: 404, error: 'No such student.' };
    const key = [g.runId, g.moduleId, g.aliasId, g.questionId];
    if (g.score === null) {
      stmts.push(db.prepare('DELETE FROM grades WHERE run_id = ?1 AND module_id = ?2 AND alias_id = ?3 AND question_id = ?4').bind(...key));
      cleared++;
      continue;
    }
    const max = pointsOf(q);
    const score = Math.min(max, Math.round(g.score * 100) / 100);
    const answer = String(answers.get(`${g.runId}|${g.moduleId}|${g.aliasId}`)?.[g.questionId] ?? '').slice(0, 2000);
    stmts.push(
      db
        .prepare(
          `INSERT INTO grades (run_id, module_id, alias_id, question_id, score, max, comment, source, answer, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'teacher', ?8, ?9)
           ON CONFLICT (run_id, module_id, alias_id, question_id) DO UPDATE SET
             score = excluded.score, max = excluded.max, comment = excluded.comment, source = 'teacher',
             answer = excluded.answer, updated_at = excluded.updated_at`
        )
        .bind(...key, score, max, g.comment, answer, now)
    );
    saved.push({ runId: g.runId, moduleId: g.moduleId, aliasId: g.aliasId, questionId: g.questionId, score, max, comment: g.comment, source: 'teacher', answer, at: now });
  }
  if (stmts.length) await db.batch(stmts);
  return { ok: true, saved, cleared };
}

/** Releases (or takes back) a module's grades for some deliveries of one of the teacher's lessons. */
export async function setReleased(db: any, teacherId: string, lessonId: string, runIds: string[], moduleId: string, released: boolean, now = Date.now()) {
  if (!runIds.length || runIds.length > 40) return 0;
  const { results } = await db
    .prepare(
      `SELECT r.id, r.snapshot_json FROM lesson_runs r JOIN lessons l ON l.id = r.lesson_id
       WHERE l.teacher_id = ?1 AND l.id = ?2 AND r.status != 'scheduled' AND r.id ${IN(3)}`
    )
    .bind(teacherId, lessonId, JSON.stringify(runIds))
    .all();
  const ok = (results as any[]).filter((r) => gradedModules(parse(r.snapshot_json, null)).some((m: any) => m.id === moduleId)).map((r) => r.id);
  if (!ok.length) return 0;
  await db.batch(
    ok.map((id) =>
      released
        ? db.prepare('INSERT INTO grade_releases (run_id, module_id, released_at) VALUES (?1, ?2, ?3) ON CONFLICT (run_id, module_id) DO NOTHING').bind(id, moduleId, now)
        : db.prepare('DELETE FROM grade_releases WHERE run_id = ?1 AND module_id = ?2').bind(id, moduleId)
    )
  );
  return ok.length;
}

/* ---------------- what's waiting ---------------- */

export interface RunWaiting {
  /** Long answers with an answer and no grade. */
  toGrade: number;
  /** Graded modules with long answers or grades given, not released yet. */
  toRelease: number;
}

/** What's waiting in one delivery, from its snapshot, submissions, grades and releases. */
export function waitingIn(
  lesson: any,
  subs: { moduleId: string; aliasId: string; answers: Record<string, string> }[],
  grades: GradeRow[],
  released: (moduleId: string) => boolean
): RunWaiting {
  let toGrade = 0;
  let toRelease = 0;
  const graded = new Set(grades.map((g) => `${g.moduleId}|${g.aliasId}|${g.questionId}`));
  for (const m of gradedModules(lesson)) {
    const qs = questionsOf(m);
    const mine = subs.filter((s) => s.moduleId === m.id);
    let answered = false;
    for (const q of qs) {
      if (q.kind !== 'long') continue;
      for (const s of mine) {
        if (!(s.answers?.[q.id] ?? '').trim()) continue;
        answered = true;
        if (!graded.has(`${m.id}|${s.aliasId}|${q.id}`)) toGrade++;
      }
    }
    const hasGrades = grades.some((g) => g.moduleId === m.id);
    if ((hasGrades || (isHandGraded(qs) && answered)) && !released(m.id)) toRelease++;
  }
  return { toGrade, toRelease };
}

type Sub = { runId: string; moduleId: string; aliasId: string; answers: Record<string, string> };

async function submissionsForRuns(db: any, runIds: string[]): Promise<Sub[]> {
  if (!runIds.length) return [];
  const { results } = await db
    .prepare(`SELECT run_id, module_id, alias_id, answers_json FROM submissions WHERE run_id ${IN(1)}`)
    .bind(JSON.stringify(runIds))
    .all();
  return (results as any[]).map((r) => ({ runId: r.run_id, moduleId: r.module_id, aliasId: r.alias_id, answers: parse(r.answers_json, {}) ?? {} }));
}

export interface ToGradeItem {
  lessonId: string;
  lessonTitle: string;
  toGrade: number;
  toRelease: number;
  runs: { runId: string; className: string; period: string; date: string; toGrade: number; toRelease: number }[];
}

/**
 * The to-grade list: deliveries that have ended with long answers to grade or grades to release,
 * grouped by lesson (newest first). Archived lessons are left out. Worked out from the data each
 * time, never stored, so it can't go stale.
 */
export async function toGradeList(db: any, teacherId: string): Promise<ToGradeItem[]> {
  const { results: runs } = await db
    .prepare(
      `SELECT r.id, r.lesson_id, r.run_date, r.snapshot_json, l.title, c.name, c.period
       FROM lesson_runs r JOIN lessons l ON l.id = r.lesson_id JOIN classes c ON c.id = r.class_id
       WHERE l.teacher_id = ?1 AND l.archived = 0 AND r.status = 'ended' AND r.snapshot_json IS NOT NULL
       ORDER BY r.scheduled_start DESC`
    )
    .bind(teacherId)
    .all();
  // Only deliveries whose lesson has something graded after class are worth reading further.
  const candidates = (runs as any[]).map((r) => ({ ...r, lesson: parse(r.snapshot_json, null) })).filter((r) => gradedModules(r.lesson).length);
  if (!candidates.length) return [];
  const ids = candidates.map((r) => r.id);
  const [subs, grades, releases] = await Promise.all([submissionsForRuns(db, ids), gradesForRuns(db, ids), releasesForRuns(db, ids)]);
  const items = new Map<string, ToGradeItem>();
  for (const r of candidates) {
    const w = waitingIn(
      r.lesson,
      subs.filter((s) => s.runId === r.id),
      grades.filter((g) => g.runId === r.id),
      (m) => releases.has(`${r.id}|${m}`)
    );
    if (!w.toGrade && !w.toRelease) continue;
    const item: ToGradeItem = items.get(r.lesson_id) ?? { lessonId: r.lesson_id, lessonTitle: r.title, toGrade: 0, toRelease: 0, runs: [] };
    item.toGrade += w.toGrade;
    item.toRelease += w.toRelease;
    item.runs.push({ runId: r.id, className: r.name, period: r.period, date: r.run_date, ...w });
    items.set(r.lesson_id, item);
  }
  return [...items.values()];
}

/* ---------------- the grading screen ---------------- */

/**
 * Everything the grading screen needs for one lesson: its deliveries (not scheduled ones), each
 * with its own copy of the graded modules (keys included: teacher only), the students, their
 * answers, the grades given, and what's released. Scores come from scoreModule in the browser.
 */
export async function gradingView(db: any, teacherId: string, lessonId: string) {
  const lessonRow = await db.prepare('SELECT id, title FROM lessons WHERE id = ?1 AND teacher_id = ?2').bind(lessonId, teacherId).first();
  if (!lessonRow) return null;
  const { results: runs } = await db
    .prepare(
      `SELECT r.id, r.class_id, r.run_date, r.start_time, r.status, r.snapshot_json, c.name, c.period
       FROM lesson_runs r JOIN classes c ON c.id = r.class_id
       WHERE r.lesson_id = ?1 AND r.status != 'scheduled' AND r.snapshot_json IS NOT NULL
       ORDER BY r.scheduled_start`
    )
    .bind(lessonId)
    .all();
  const ids = (runs as any[]).map((r) => r.id);
  const classIds = [...new Set((runs as any[]).map((r) => r.class_id))];
  const [subs, grades, releases, aliasRows] = await Promise.all([
    submissionsForRuns(db, ids),
    gradesForRuns(db, ids),
    releasesForRuns(db, ids),
    classIds.length
      ? db.prepare(`SELECT id, class_id, alias FROM student_aliases WHERE class_id ${IN(1)}`).bind(JSON.stringify(classIds)).all()
      : { results: [] }
  ]);
  const aliasName = new Map((aliasRows.results as any[]).map((a) => [a.id, a.alias]));
  return {
    lesson: { id: lessonRow.id, title: lessonRow.title },
    runs: (runs as any[]).map((r) => {
      const lesson = parse(r.snapshot_json, null);
      const mods = gradedModules(lesson).map((m: any) => ({ id: m.id, title: m.title, questions: questionsOf(m) }));
      const mine = subs.filter((s) => s.runId === r.id && mods.some((m) => m.id === s.moduleId));
      return {
        id: r.id,
        className: r.name,
        period: r.period,
        date: r.run_date,
        startTime: r.start_time,
        status: r.status,
        modules: mods.map((m) => ({ ...m, releasedAt: releases.get(`${r.id}|${m.id}`) ?? null })),
        submissions: mine.map((s) => ({ moduleId: s.moduleId, aliasId: s.aliasId, alias: aliasName.get(s.aliasId) ?? '?', answers: s.answers })),
        grades: grades.filter((g) => g.runId === r.id)
      };
    })
  };
}

/** A student's module score as they may see it: released grades only. */
export function studentModuleScore(questions: Question[], answers: Record<string, string> | undefined, released: boolean, grades: Record<string, StoredGrade> | undefined, feedback?: Record<string, any>) {
  const marks: Record<string, 'right' | 'partial' | 'wrong' | null> = {};
  for (const [qid, f] of Object.entries(feedback ?? {})) marks[qid] = (f as any)?.mark ?? null;
  return scoreModule(questions, answers, released ? grades ?? {} : {}, marks);
}
