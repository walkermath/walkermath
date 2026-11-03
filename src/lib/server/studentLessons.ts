// src/lib/server/studentLessons.ts
// Phase 5b: a student's own lessons. Upcoming deliveries show only a title and a time. Past ones
// show the lesson as it was taught (from the run's snapshot): every page with the teacher's ink,
// boards added in class included, so an absent student sees what they missed, plus that student's
// own answers, marks and game scores. Never anyone else's answers, the answer keys, or the
// teacher's private notes.

import { isCorrect, type Answers } from '../lesson/answers.ts';
import { pagesOf, type Page, type RoomModule } from '../lesson/room.ts';
import { roomModules } from './live.ts';
import { studentNotes } from './notes.ts';
import type { Student } from './sessions.ts';
import { runSnapshot, studentAnswers } from './submissions.ts';

export const STUDENT_LESSON_LIMITS = { past: 100, upcoming: 10 } as const;

const parse = (s: unknown, fallback: any) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
};

export interface LessonListItem {
  runId: string;
  title: string;
  /** 'YYYY-MM-DD' and 'HH:MM', as scheduled */
  date: string;
  startTime: string;
}

/** The student's class: finished deliveries (newest first) and the next few scheduled ones. */
export async function classLessons(db: any, s: Student, now = Date.now()): Promise<{ past: LessonListItem[]; upcoming: LessonListItem[] }> {
  const [past, upcoming] = await Promise.all([
    db
      .prepare(
        `SELECT r.id, COALESCE(json_extract(r.snapshot_json, '$.title'), l.title) AS title, r.run_date, r.start_time
           FROM lesson_runs r JOIN lessons l ON l.id = r.lesson_id
          WHERE r.class_id = ?1 AND r.status = 'ended' AND r.snapshot_json IS NOT NULL
          ORDER BY r.scheduled_start DESC LIMIT ${STUDENT_LESSON_LIMITS.past}`
      )
      .bind(s.classId)
      .all(),
    db
      .prepare(
        `SELECT r.id, l.title, r.run_date, r.start_time
           FROM lesson_runs r JOIN lessons l ON l.id = r.lesson_id
          WHERE r.class_id = ?1 AND r.status = 'scheduled' AND r.scheduled_end > ?2
          ORDER BY r.scheduled_start LIMIT ${STUDENT_LESSON_LIMITS.upcoming}`
      )
      .bind(s.classId, now)
      .all()
  ]);
  const item = (r: any): LessonListItem => ({ runId: r.id, title: r.title, date: r.run_date, startTime: r.start_time });
  return { past: past.results.map(item), upcoming: upcoming.results.map(item) };
}

export interface PastLesson {
  run: { id: string; title: string; date: string; startTime: string };
  resources: { label: string; url: string }[];
  /** Each module as students saw it (no keys, no private notes) and its pages as they ended up. */
  modules: { module: RoomModule; pages: Page[] }[];
  /** The teacher's ink, by page id. */
  ink: Record<string, unknown[]>;
  /** This student's answers, by module id. */
  answers: Record<string, Answers>;
  /** Right / wrong / no key, by module id then question id. */
  marks: Record<string, Record<string, boolean | null>>;
  /** This student's best game score, by module id. */
  scores: Record<string, { best: number; plays: number }>;
  /** This student's personal notes, by module id. */
  notes: Record<string, string>;
}

/** One finished delivery of the student's own class, or null. */
export async function pastLesson(db: any, s: Student, runId: unknown): Promise<PastLesson | null> {
  if (typeof runId !== 'string' || runId.length > 64) return null;
  const run = await db.prepare('SELECT id, class_id, status, run_date, start_time, timing_json FROM lesson_runs WHERE id = ?1').bind(runId).first();
  if (!run || run.class_id !== s.classId || run.status !== 'ended') return null;
  const lesson = await runSnapshot(db, run.id);
  if (!lesson) return null;

  const modules = roomModules(lesson);
  // Blackboards added in class, in order, from the final clock (null = the lesson's own pages).
  const pageOrder = parse(run.timing_json, null)?.pageOrder ?? null;
  const pages = modules.map((_, i) => pagesOf({ pageOrder } as any, modules, i));

  const [inkRows, answersByModule, scoreRows, notes] = await Promise.all([
    db.prepare('SELECT page_id, strokes_json FROM run_ink WHERE run_id = ?1 ORDER BY page_id, part').bind(run.id).all(),
    studentAnswers(db, run.id, s.aliasId),
    db
      .prepare(
        `SELECT module_id, MAX(score) AS best, COUNT(*) AS plays FROM lesson_scores
          WHERE run_id = ?1 AND alias_id = ?2 AND module_id IS NOT NULL GROUP BY module_id`
      )
      .bind(run.id, s.aliasId)
      .all(),
    studentNotes(db, run.id, s.aliasId)
  ]);

  const shown = new Set(pages.flat().map((p) => p.id));
  const ink: Record<string, unknown[]> = {};
  for (const r of inkRows.results as any[]) {
    if (!shown.has(r.page_id)) continue;
    const strokes = parse(r.strokes_json, []);
    if (Array.isArray(strokes)) (ink[r.page_id] ??= []).push(...strokes);
  }

  const answers: Record<string, Answers> = {};
  for (const [id, a] of Object.entries(answersByModule)) answers[id] = a.answers;

  // Marked against the run's own keys (the snapshot), the keys themselves never leave the server.
  const marks: PastLesson['marks'] = {};
  for (const m of lesson.modules as any[]) {
    if (m.type !== 'prompt' || !answers[m.id]) continue;
    const out: Record<string, boolean | null> = {};
    for (const q of m.config?.questions ?? []) out[q.id] = isCorrect(q, answers[m.id][q.id]);
    marks[m.id] = out;
  }

  const scores: PastLesson['scores'] = {};
  for (const r of scoreRows.results as any[]) scores[r.module_id] = { best: Number(r.best), plays: Number(r.plays) };

  return {
    run: { id: run.id, title: String(lesson.title ?? ''), date: run.run_date, startTime: run.start_time },
    resources: Array.isArray((lesson as any).resources) ? (lesson as any).resources : [],
    modules: modules.map((module, i) => ({ module, pages: pages[i] })),
    ink,
    answers,
    marks,
    scores,
    notes
  };
}
