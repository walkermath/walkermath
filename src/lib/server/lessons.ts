// src/lib/server/lessons.ts
// Data access for lessons, their modules and scheduled runs. Every query is scoped by teacher id,
// so a teacher can only ever see or change their own lessons.

import { isBellTime } from '../classroom.ts';
import {
  isActivityCategory,
  isPromptCategory,
  joinModule,
  normalizeOrder,
  splitModule,
  upgradeNotesConfig,
  type LessonFields,
  type LessonModule,
  type ModuleType
} from '../lesson/modules.ts';
import { clockMinutes, isIsoDate, zonedToUtc } from '../lesson/time.ts';
import { newId } from './crypto.ts';

export const MAX_LESSONS = 300;
export const MAX_UPCOMING_RUNS_PER_LESSON = 30;
export const MIN_RUN_MIN = 5;

export interface LessonSummary {
  id: string;
  title: string;
  topic: string;
  durationSec: number;
  archived: boolean;
  updatedAt: number;
  moduleCount: number;
  plannedSec: number;
  nextRunAt: number | null;
}

export interface Lesson extends LessonFields {
  id: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  modules: LessonModule[];
}

export interface Run {
  id: string;
  lessonId: string;
  lessonTitle?: string;
  classId: string;
  className: string;
  period: string;
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  scheduledStart: number;
  scheduledEnd: number;
  status: 'scheduled' | 'live' | 'ended';
}

const parse = (s: unknown, fallback: any) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
};

const toModule = (r: any): LessonModule => {
  const priv = parse(r.private_json, {});
  let config: any = joinModule(parse(r.config_json, {}), priv, r.type);
  if (r.type === 'notes') config = upgradeNotesConfig(config); // saved before slides existed
  // Activities saved before categories existed.
  if (r.type === 'activity' && !isActivityCategory(config.category)) config.category = 'other';
  if (r.type === 'activity' && typeof config.coliseumId !== 'string') config.coliseumId = ''; // before Coliseum embeds
  if (r.type === 'prompt' && !isPromptCategory(config.category)) config.category = 'other';
  return {
    id: r.id,
    type: r.type as ModuleType,
    title: r.title,
    plannedSec: r.planned_sec,
    pacing: r.pacing === 'locked' ? 'locked' : 'flex',
    minSec: r.min_sec ?? null,
    onTimeUp: r.on_time_up === 'hold' ? 'hold' : 'auto',
    config,
    teacherNotes: typeof priv?.notes === 'string' ? priv.notes : ''
  };
};

const toRun = (r: any): Run => ({
  id: r.id,
  lessonId: r.lesson_id,
  ...(r.lesson_title !== undefined ? { lessonTitle: r.lesson_title } : {}),
  classId: r.class_id,
  className: r.class_name,
  period: r.period,
  date: r.run_date,
  startTime: r.start_time,
  endTime: r.end_time,
  timeZone: r.time_zone,
  scheduledStart: r.scheduled_start,
  scheduledEnd: r.scheduled_end,
  status: r.status
});

/* ---------------- lessons ---------------- */

export async function listLessons(db: any, teacherId: string, now = Date.now()): Promise<LessonSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT l.id, l.title, l.topic, l.duration_sec, l.archived, l.updated_at,
              (SELECT COUNT(*) FROM lesson_modules m WHERE m.lesson_id = l.id) AS module_count,
              (SELECT COALESCE(SUM(planned_sec), 0) FROM lesson_modules m WHERE m.lesson_id = l.id) AS planned_sec,
              (SELECT MIN(scheduled_start) FROM lesson_runs r
                WHERE r.lesson_id = l.id AND r.status != 'ended' AND r.scheduled_end > ?2) AS next_run_at
         FROM lessons l WHERE l.teacher_id = ?1
        ORDER BY l.archived, l.updated_at DESC`
    )
    .bind(teacherId, now)
    .all();
  return results.map((r: any) => ({
    id: r.id,
    title: r.title,
    topic: r.topic ?? '',
    durationSec: r.duration_sec,
    archived: !!r.archived,
    updatedAt: r.updated_at,
    moduleCount: Number(r.module_count),
    plannedSec: Number(r.planned_sec),
    nextRunAt: r.next_run_at ?? null
  }));
}

export async function getLesson(db: any, teacherId: string, lessonId: unknown): Promise<Lesson | null> {
  if (typeof lessonId !== 'string' || lessonId.length > 64) return null;
  const row = await db.prepare('SELECT * FROM lessons WHERE id = ?1 AND teacher_id = ?2').bind(lessonId, teacherId).first();
  if (!row) return null;
  const { results } = await db
    .prepare('SELECT * FROM lesson_modules WHERE lesson_id = ?1 ORDER BY position')
    .bind(lessonId)
    .all();
  return {
    id: row.id,
    title: row.title,
    topic: row.topic ?? '',
    objective: row.objective,
    successCriteria: row.success_criteria,
    standards: row.standards ?? '',
    resources: parse(row.resources_json, []),
    durationSec: row.duration_sec,
    archived: !!row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    modules: normalizeOrder(results.map(toModule))
  };
}

function moduleInserts(db: any, lessonId: string, modules: LessonModule[]) {
  return modules.map((m, position) => {
    const stored = splitModule(m);
    return db
      .prepare(
        `INSERT INTO lesson_modules
           (id, lesson_id, position, type, title, planned_sec, pacing, min_sec, on_time_up, config_json, private_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      )
      .bind(
        m.id,
        lessonId,
        position,
        m.type,
        m.title,
        m.plannedSec,
        m.pacing,
        m.minSec,
        m.onTimeUp,
        JSON.stringify(stored.config),
        JSON.stringify(stored.private)
      );
  });
}

export async function createLesson(db: any, teacherId: string, fields: LessonFields, modules: LessonModule[] = []): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO lessons (id, teacher_id, title, topic, objective, success_criteria, standards, resources_json, duration_sec, archived, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?10)`
      )
      .bind(
        id,
        teacherId,
        fields.title,
        fields.topic,
        fields.objective,
        fields.successCriteria,
        fields.standards,
        JSON.stringify(fields.resources),
        fields.durationSec,
        now
      ),
    ...moduleInserts(db, id, modules)
  ]);
  return id;
}

/** Module ids already used by a *different* lesson (ids are global primary keys). */
export async function foreignModuleIds(db: any, lessonId: string, ids: string[]): Promise<boolean> {
  if (!ids.length) return false;
  const marks = ids.map((_, i) => `?${i + 2}`).join(',');
  const row = await db
    .prepare(`SELECT 1 AS hit FROM lesson_modules WHERE lesson_id != ?1 AND id IN (${marks}) LIMIT 1`)
    .bind(lessonId, ...ids)
    .first();
  return !!row;
}

/**
 * Replace the lesson's fields and whole module chain in one transaction. The caller first checks
 * that the editor's base version matches `lesson.updatedAt`, so a save from a stale tab is refused.
 * Returns the new version.
 */
export async function saveLesson(
  db: any,
  lesson: Lesson,
  fields: LessonFields,
  modules: LessonModule[]
): Promise<number> {
  const now = Math.max(Date.now(), lesson.updatedAt + 1);
  await db.batch([
    db
      .prepare(
        `UPDATE lessons SET title = ?2, topic = ?3, objective = ?4, success_criteria = ?5, standards = ?6, resources_json = ?7, duration_sec = ?8, updated_at = ?9
          WHERE id = ?1`
      )
      .bind(
        lesson.id,
        fields.title,
        fields.topic,
        fields.objective,
        fields.successCriteria,
        fields.standards,
        JSON.stringify(fields.resources),
        fields.durationSec,
        now
      ),
    db.prepare('DELETE FROM lesson_modules WHERE lesson_id = ?1').bind(lesson.id),
    ...moduleInserts(db, lesson.id, modules)
  ]);
  return now;
}

export async function setLessonArchived(db: any, lessonId: string, archived: boolean) {
  await db.prepare('UPDATE lessons SET archived = ?2 WHERE id = ?1').bind(lessonId, archived ? 1 : 0).run();
}

/** Lessons with a run that has started can't be deleted (that history matters); archive instead. */
export async function hasStartedRuns(db: any, lessonId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS hit FROM lesson_runs WHERE lesson_id = ?1 AND status != 'scheduled' LIMIT 1")
    .bind(lessonId)
    .first();
  return !!row;
}

/* ---------------- runs ---------------- */

const RUN_SELECT = `SELECT r.*, c.name AS class_name, c.period FROM lesson_runs r JOIN classes c ON c.id = r.class_id`;

export async function lessonRuns(db: any, lessonId: string): Promise<Run[]> {
  const { results } = await db
    .prepare(`${RUN_SELECT} WHERE r.lesson_id = ?1 ORDER BY r.scheduled_start`)
    .bind(lessonId)
    .all();
  return results.map(toRun);
}

/** Runs for the teach home: anything live, or scheduled to end after `since`. */
export async function upcomingRuns(db: any, teacherId: string, since: number): Promise<Run[]> {
  const { results } = await db
    .prepare(
      `SELECT r.*, c.name AS class_name, c.period, l.title AS lesson_title
         FROM lesson_runs r
         JOIN lessons l ON l.id = r.lesson_id
         JOIN classes c ON c.id = r.class_id
        WHERE l.teacher_id = ?1 AND (r.status = 'live' OR (r.status = 'scheduled' AND r.scheduled_end > ?2))
        ORDER BY r.scheduled_start LIMIT 50`
    )
    .bind(teacherId, since)
    .all();
  return results.map(toRun);
}

export async function ownedRun(db: any, lessonId: string, runId: unknown): Promise<Run | null> {
  if (typeof runId !== 'string' || runId.length > 64) return null;
  const row = await db.prepare(`${RUN_SELECT} WHERE r.id = ?1 AND r.lesson_id = ?2`).bind(runId, lessonId).first();
  return row ? toRun(row) : null;
}

export interface RunInput {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  scheduledStart: number;
  scheduledEnd: number;
}

/**
 * Validate a delivery: the class must be the teacher's and open, the times real, the window at
 * least 5 minutes, not already over, and not overlapping another delivery to the same class.
 */
export async function cleanRunInput(
  db: any,
  teacherId: string,
  body: any,
  timeZone: string,
  exceptRunId: string | null,
  now = Date.now()
): Promise<RunInput | string> {
  const classId = typeof body?.classId === 'string' ? body.classId : '';
  const cls = classId.length <= 64
    ? await db.prepare('SELECT id, archived FROM classes WHERE id = ?1 AND teacher_id = ?2').bind(classId, teacherId).first()
    : null;
  if (!cls) return 'Pick one of your classes.';
  if (cls.archived) return 'That class is archived. Restore it first.';
  if (!isIsoDate(body?.date)) return 'Pick a date.';
  if (!isBellTime(body?.startTime) || !isBellTime(body?.endTime)) return 'Start and end times look wrong.';
  if (clockMinutes(body.endTime) - clockMinutes(body.startTime) < MIN_RUN_MIN) {
    return `The class has to end at least ${MIN_RUN_MIN} minutes after it starts.`;
  }
  const scheduledStart = zonedToUtc(body.date, body.startTime, timeZone);
  const scheduledEnd = zonedToUtc(body.date, body.endTime, timeZone);
  if (scheduledEnd <= now) return 'That time has already passed.';

  const clash = await db
    .prepare(
      `SELECT l.title FROM lesson_runs r JOIN lessons l ON l.id = r.lesson_id
        WHERE r.class_id = ?1 AND r.status != 'ended' AND r.id != ?2
          AND r.scheduled_start < ?4 AND r.scheduled_end > ?3
        LIMIT 1`
    )
    .bind(classId, exceptRunId ?? '', scheduledStart, scheduledEnd)
    .first();
  if (clash) return `That class already has "${clash.title}" at that time.`;

  return { classId, date: body.date, startTime: body.startTime, endTime: body.endTime, timeZone, scheduledStart, scheduledEnd };
}

export async function insertRun(db: any, lessonId: string, input: RunInput): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO lesson_runs
         (id, lesson_id, class_id, run_date, start_time, end_time, time_zone, scheduled_start, scheduled_end, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'scheduled', ?10)`
    )
    .bind(id, lessonId, input.classId, input.date, input.startTime, input.endTime, input.timeZone, input.scheduledStart, input.scheduledEnd, Date.now())
    .run();
  return id;
}

export async function updateRun(db: any, runId: string, input: RunInput) {
  await db
    .prepare(
      `UPDATE lesson_runs SET class_id = ?2, run_date = ?3, start_time = ?4, end_time = ?5, time_zone = ?6,
              scheduled_start = ?7, scheduled_end = ?8
        WHERE id = ?1 AND status = 'scheduled'`
    )
    .bind(runId, input.classId, input.date, input.startTime, input.endTime, input.timeZone, input.scheduledStart, input.scheduledEnd)
    .run();
}

export async function countUpcomingRuns(db: any, lessonId: string, now = Date.now()): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM lesson_runs WHERE lesson_id = ?1 AND status = 'scheduled' AND scheduled_end > ?2")
    .bind(lessonId, now)
    .first();
  return Number(row.n);
}
