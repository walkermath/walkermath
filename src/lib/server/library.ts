// src/lib/server/library.ts
// Lessons that move between teachers: a Markdown export brought back in (import), and the shared
// library (migrations/0011_library.sql). Either way the lesson is checked like any lesson save,
// and gets new ids for every module, question and slide, so it never collides with the original.

import { cleanLessonFields, cleanModules, type LessonFields, type LessonModule } from '../lesson/modules.ts';
import { createLesson, getLesson, type Lesson } from './lessons.ts';
import { newId } from './crypto.ts';

const parse = (s: unknown, fallback: any) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
};

/** A lesson from elsewhere, checked, with fresh ids throughout; or an error message. */
export function freshLesson(raw: any): { fields: LessonFields; modules: LessonModule[] } | string {
  if (!raw || typeof raw !== 'object') return "That isn't a lesson.";
  const fields = cleanLessonFields(raw);
  if (typeof fields === 'string') return fields;
  const list = Array.isArray(raw.modules) ? raw.modules : [];
  const renewed = list.map((m: any) => {
    const c = m?.config && typeof m.config === 'object' ? m.config : {};
    const config =
      m?.type === 'prompt' || (m?.type === 'activity' && Array.isArray(c.questions))
        ? { ...c, questions: (Array.isArray(c.questions) ? c.questions : []).map((q: any) => ({ ...q, id: crypto.randomUUID() })) }
        : m?.type === 'notes' && Array.isArray(c.slides)
          ? { ...c, slides: c.slides.map((s: any) => ({ ...s, id: crypto.randomUUID() })) }
          : c;
    return { ...m, id: crypto.randomUUID(), config };
  });
  const modules = cleanModules(renewed);
  if (typeof modules === 'string') return modules;
  return { fields, modules };
}

/** Makes a new lesson for this teacher from a lesson found elsewhere. */
export async function importLesson(db: any, teacherId: string, raw: any, title?: string): Promise<{ id: string } | string> {
  const fresh = freshLesson(raw);
  if (typeof fresh === 'string') return fresh;
  const id = await createLesson(db, teacherId, { ...fresh.fields, ...(title ? { title } : {}) }, fresh.modules);
  return { id };
}

/** What gets shared: the lesson's fields and modules (keys and teacher notes included), nothing else. */
const shareable = (l: Lesson) => ({
  title: l.title,
  topic: l.topic,
  objective: l.objective,
  successCriteria: l.successCriteria,
  standards: l.standards,
  resources: l.resources,
  durationSec: l.durationSec,
  modules: l.modules
});

export interface LibraryEntry {
  id: string;
  lessonId: string | null;
  title: string;
  topic: string;
  standards: string;
  moduleCount: number;
  durationSec: number;
  author: string;
  mine: boolean;
  copies: number;
  updatedAt: number;
}

const ENTRY = `SELECT b.id, b.lesson_id, b.teacher_id, b.title, b.topic, b.standards, b.module_count, b.duration_sec, b.copies, b.updated_at,
                      t.display_name
                 FROM library_lessons b JOIN teachers t ON t.id = b.teacher_id`;

const toEntry = (r: any, me: string): LibraryEntry => ({
  id: r.id,
  lessonId: r.teacher_id === me ? r.lesson_id : null,
  title: r.title,
  topic: r.topic,
  standards: r.standards,
  moduleCount: Number(r.module_count),
  durationSec: Number(r.duration_sec),
  author: r.display_name || 'a teacher',
  mine: r.teacher_id === me,
  copies: Number(r.copies),
  updatedAt: Number(r.updated_at)
});

export async function listLibrary(db: any, me: string): Promise<LibraryEntry[]> {
  const { results } = await db.prepare(`${ENTRY} ORDER BY b.updated_at DESC LIMIT 500`).all();
  return results.map((r: any) => toEntry(r, me));
}

/** Shares a lesson (or refreshes the shared copy). Only its own teacher can. */
export async function shareLesson(db: any, teacherId: string, lessonId: unknown): Promise<LibraryEntry | null> {
  const lesson = await getLesson(db, teacherId, lessonId);
  if (!lesson) return null;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO library_lessons (id, lesson_id, teacher_id, title, topic, standards, module_count, duration_sec, lesson_json, copies, published_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?10)
       ON CONFLICT (lesson_id) DO UPDATE SET title = excluded.title, topic = excluded.topic, standards = excluded.standards,
         module_count = excluded.module_count, duration_sec = excluded.duration_sec, lesson_json = excluded.lesson_json, updated_at = excluded.updated_at`
    )
    .bind(newId(), lesson.id, teacherId, lesson.title, lesson.topic, lesson.standards, lesson.modules.length, lesson.durationSec, JSON.stringify(shareable(lesson)), now)
    .run();
  const row = await db.prepare(`${ENTRY} WHERE b.lesson_id = ?1`).bind(lesson.id).first();
  return row ? toEntry(row, teacherId) : null;
}

/** The shared lesson in full (any signed-in teacher), or null. */
export async function libraryLesson(db: any, entryId: unknown): Promise<any | null> {
  if (typeof entryId !== 'string' || entryId.length > 64) return null;
  const row = await db.prepare('SELECT lesson_json FROM library_lessons WHERE id = ?1').bind(entryId).first();
  return row ? parse(row.lesson_json, null) : null;
}

export async function unshare(db: any, teacherId: string, entryId: unknown): Promise<boolean> {
  if (typeof entryId !== 'string') return false;
  const r = await db.prepare('DELETE FROM library_lessons WHERE id = ?1 AND teacher_id = ?2').bind(entryId, teacherId).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Copies a shared lesson into this teacher's lessons. */
export async function copyFromLibrary(db: any, teacherId: string, entryId: unknown): Promise<{ id: string } | string | null> {
  const lesson = await libraryLesson(db, entryId);
  if (!lesson) return null;
  const made = await importLesson(db, teacherId, lesson);
  if (typeof made !== 'string') await db.prepare('UPDATE library_lessons SET copies = copies + 1 WHERE id = ?1').bind(entryId).run();
  return made;
}
