// src/lib/server/live.ts
// Starting, ending and connecting to live lessons. The clock itself runs in the LessonRoom
// Durable Object (live-worker/); these helpers decide who may reach which room and hand the
// room what it needs: the lesson's modules, student-safe (no answer keys, no private notes).

import { MODULE_TYPES, publicModule } from '../lesson/modules.ts';
import type { RoomModule } from '../lesson/room.ts';
import { getLesson, type Lesson } from './lessons.ts';
import type { Student, Teacher } from './sessions.ts';

export interface LiveRun {
  id: string;
  lessonId: string;
  lessonTitle: string;
  teacherId: string;
  classId: string;
  className: string;
  period: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduledStart: number;
  scheduledEnd: number;
  startedAt: number | null;
}

const RUN = `SELECT r.id, r.lesson_id, r.class_id, r.status, r.scheduled_start, r.scheduled_end, r.started_at,
                    l.title AS lesson_title, l.teacher_id, c.name AS class_name, c.period
               FROM lesson_runs r
               JOIN lessons l ON l.id = r.lesson_id
               JOIN classes c ON c.id = r.class_id`;

const toLiveRun = (r: any): LiveRun => ({
  id: r.id,
  lessonId: r.lesson_id,
  lessonTitle: r.lesson_title,
  teacherId: r.teacher_id,
  classId: r.class_id,
  className: r.class_name,
  period: r.period,
  status: r.status,
  scheduledStart: r.scheduled_start,
  scheduledEnd: r.scheduled_end,
  startedAt: r.started_at ?? null
});

export async function getLiveRun(db: any, runId: unknown): Promise<LiveRun | null> {
  if (typeof runId !== 'string' || runId.length > 64) return null;
  const row = await db.prepare(`${RUN} WHERE r.id = ?1`).bind(runId).first();
  return row ? toLiveRun(row) : null;
}

/** Live lessons a student's class is in right now (for the "join" button on /class). */
export async function liveRunsForClass(db: any, classId: string): Promise<LiveRun[]> {
  const { results } = await db.prepare(`${RUN} WHERE r.class_id = ?1 AND r.status = 'live' ORDER BY r.started_at DESC`).bind(classId).all();
  return results.map(toLiveRun);
}

/** Who may reach a run's room: its teacher always; a student of its class while it's live. */
export function roomRole(run: LiveRun, teacher: Teacher | null, student: Student | null): 'teacher' | 'student' | null {
  if (teacher && teacher.id === run.teacherId) return 'teacher';
  if (student && student.classId === run.classId && run.status === 'live') return 'student';
  return null;
}

/** The modules as the room gets them: timing plus each module's public config. */
export function roomModules(lesson: Lesson): RoomModule[] {
  return lesson.modules.map((m) => {
    const pub = publicModule(m);
    return {
      id: m.id,
      type: m.type,
      title: m.title,
      plannedSec: m.plannedSec,
      pacing: m.pacing,
      minSec: m.minSec,
      onTimeUp: m.onTimeUp,
      collects: MODULE_TYPES[m.type].collects(m.config),
      config: pub.config
    };
  });
}

export const roomStub = (env: any, runId: string) => env.LESSON_ROOM.get(env.LESSON_ROOM.idFromName(`run:${runId}`));

/** Headers that tell the room who is connecting (it trusts them: only these Functions reach it). */
export function roomHeaders(role: 'teacher' | 'student', teacher: Teacher | null, student: Student | null): Record<string, string> {
  return role === 'teacher'
    ? { 'X-Role': 'teacher', 'X-Who': teacher!.id, 'X-Name': 'teacher' }
    : { 'X-Role': 'student', 'X-Who': student!.aliasId, 'X-Name': student!.alias };
}

/**
 * Starts a run (or reopens its room if it's already live). The lesson is copied into the run
 * (snapshot_json), so editing the lesson later doesn't change a delivery that has started.
 */
export async function startRun(env: any, run: LiveRun, now = Date.now()): Promise<{ ok: true; room: any } | { ok: false; error: string; status: number }> {
  if (run.status === 'ended') return { ok: false, error: 'This delivery has already ended.', status: 409 };
  if (run.status === 'scheduled' && run.scheduledEnd <= now) {
    return { ok: false, error: "That period's bell has already rung. Move the delivery to a new time first.", status: 409 };
  }
  const lesson = await getLesson(env.DB, run.teacherId, run.lessonId);
  if (!lesson) return { ok: false, error: 'Lesson not found.', status: 404 };
  if (lesson.modules.length === 0) return { ok: false, error: 'This lesson has no modules yet.', status: 409 };
  if (!env.LESSON_ROOM) return { ok: false, error: 'The live room is not available (is the walkermath-live Worker running?).', status: 503 };

  const res = await roomStub(env, run.id).fetch('https://room.internal/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Role': 'teacher', 'X-Who': run.teacherId },
    body: JSON.stringify({
      runId: run.id,
      title: lesson.title,
      resources: lesson.resources,
      modules: roomModules(lesson),
      endsAt: run.scheduledEnd
    })
  });
  if (!res.ok) return { ok: false, error: 'The live room could not start.', status: 502 };
  const room = await res.json();

  if (run.status === 'scheduled') {
    await env.DB.prepare(
      "UPDATE lesson_runs SET status = 'live', started_at = ?2, snapshot_json = ?3 WHERE id = ?1 AND status = 'scheduled'"
    )
      .bind(run.id, now, JSON.stringify(lesson))
      .run();
  }
  return { ok: true, room };
}

export async function endRun(env: any, run: LiveRun, now = Date.now()) {
  let timing: string | null = null;
  if (env.LESSON_ROOM && run.status === 'live') {
    const res = await roomStub(env, run.id)
      .fetch('https://room.internal/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Role': 'teacher', 'X-Who': run.teacherId },
        body: JSON.stringify({ cmd: { type: 'end' } })
      })
      .catch(() => null); // the run ends in D1 even if the room can't be reached
    // Keep the final clock (time each module was given, used and on screen) for records.
    const st = res?.ok ? ((await res.json().catch(() => null)) as any)?.state : null;
    if (st && Array.isArray(st.plan)) {
      timing = JSON.stringify({ plan: st.plan, spent: st.spent ?? null, took: st.took ?? null, done: st.done ?? null, startedAt: st.startedAt, endedAt: st.endedAt });
    }
  }
  await env.DB.prepare("UPDATE lesson_runs SET status = 'ended', ended_at = ?2, timing_json = COALESCE(?3, timing_json) WHERE id = ?1 AND status != 'ended'")
    .bind(run.id, now, timing)
    .run();
}
