// src/lib/server/notes.ts
// Students' personal notes (migrations/0010_student_notes.sql). A note belongs to one student and
// one module of a delivery of their own class, live or finished. Only that student reads or writes
// it; nothing on the teacher's side reads this table.

import { getLiveRun } from './live.ts';
import type { Student } from './sessions.ts';
import { runSnapshot } from './submissions.ts';

export const NOTE_MAX = 4000;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** A live or finished delivery of the student's own class, or null. */
async function ownRun(db: any, s: Student, runId: unknown) {
  const run = await getLiveRun(db, runId);
  return run && run.classId === s.classId && (run.status === 'live' || run.status === 'ended') ? run : null;
}

/** The student's notes for a delivery, by module id ({} before migration 0010 is run). */
export async function studentNotes(db: any, runId: string, aliasId: string): Promise<Record<string, string>> {
  try {
    const { results } = await db.prepare('SELECT module_id, body FROM student_notes WHERE run_id = ?1 AND alias_id = ?2').bind(runId, aliasId).all();
    return Object.fromEntries(results.map((r: any) => [r.module_id, r.body]));
  } catch {
    return {};
  }
}

export async function readNotes(db: any, s: Student, runId: unknown): Promise<Record<string, string> | null> {
  const run = await ownRun(db, s, runId);
  return run ? studentNotes(db, run.id, s.aliasId) : null;
}

/** Saves (or, when empty, removes) one note. */
export async function saveNote(
  db: any,
  s: Student,
  runId: unknown,
  moduleId: unknown,
  text: unknown,
  now = Date.now()
): Promise<{ ok: true; updatedAt: number } | { ok: false; status: number; error: string }> {
  if (typeof text !== 'string') return { ok: false, status: 400, error: 'Invalid note.' };
  if (text.length > NOTE_MAX) return { ok: false, status: 400, error: `Keep a note under ${NOTE_MAX} characters.` };
  const run = await ownRun(db, s, runId);
  if (!run) return { ok: false, status: 404, error: 'Not found.' };
  const lesson = await runSnapshot(db, run.id);
  if (typeof moduleId !== 'string' || !lesson?.modules.some((m: any) => m.id === moduleId)) return { ok: false, status: 404, error: 'No such module.' };
  const body = text.replace(CONTROL, '');
  if (body.trim() === '') {
    await db.prepare('DELETE FROM student_notes WHERE run_id = ?1 AND alias_id = ?2 AND module_id = ?3').bind(run.id, s.aliasId, moduleId).run();
  } else {
    await db
      .prepare(
        `INSERT INTO student_notes (run_id, alias_id, module_id, body, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (run_id, alias_id, module_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
      )
      .bind(run.id, s.aliasId, moduleId, body, now)
      .run();
  }
  return { ok: true, updatedAt: now };
}
