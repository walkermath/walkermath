// src/lib/server/runText.ts
// Fixing a typo in notes after a lesson was taught. A delivery keeps its own copy of the lesson
// (snapshot_json), which is what students see under "past lessons", so correcting the lesson
// afterwards doesn't reach it. This rewrites the text of Notes pages in that copy, and nothing else:
// questions, answer keys and module structure stay as they were, so answers and marks keep their
// meaning. Ended deliveries only (a scheduled one picks up edits to the lesson itself).

import { cleanText, LIMITS } from '../lesson/modules.ts';
import { getLesson, saveLesson } from './lessons.ts';
import { runSnapshot } from './submissions.ts';
import type { LiveRun } from './live.ts';

export interface TextPage {
  id: string;
  markdown: string;
}
export interface TextModule {
  id: string;
  title: string;
  slides: TextPage[];
}
export interface TextEdit {
  moduleId: string;
  slideId: string;
  markdown: string;
}

const slidesOf = (m: any): { id: string; markdown: string }[] => (m?.type === 'notes' && Array.isArray(m.config?.slides) ? m.config.slides : []);

/** The Notes pages of a delivery as they were taught (what the editor shows). */
export async function runText(db: any, run: LiveRun): Promise<TextModule[] | null> {
  const lesson = await runSnapshot(db, run.id);
  if (!lesson) return null;
  return lesson.modules
    .filter((m: any) => m.type === 'notes')
    .map((m: any) => ({ id: m.id, title: m.title, slides: slidesOf(m).map((s) => ({ id: s.id, markdown: s.markdown ?? '' })) }));
}

export type SaveTextResult =
  | { ok: true; changed: number; lessonFixed: number; lessonSkipped: number }
  | { ok: false; error: string; status: number };

/**
 * Applies the edits to the delivery's copy. With alsoLesson, the same fix goes into the teacher's
 * lesson too, but only where that page still says what it said when taught (a page you've since
 * rewritten is left alone, and counted in lessonSkipped).
 */
export async function saveRunText(db: any, run: LiveRun, input: unknown, alsoLesson: boolean): Promise<SaveTextResult> {
  if (run.status !== 'ended') return { ok: false, error: 'Only a finished delivery can be corrected here. Edit the lesson instead.', status: 409 };
  const raw = Array.isArray(input) ? input : null;
  if (!raw || raw.length === 0 || raw.length > LIMITS.slides * LIMITS.modules) return { ok: false, error: 'Nothing to save.', status: 400 };
  const lesson = await runSnapshot(db, run.id);
  if (!lesson) return { ok: false, error: 'This delivery has no saved copy of the lesson.', status: 409 };

  // Check every edit before changing anything.
  const edits: (TextEdit & { before: string })[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    const moduleId = typeof e?.moduleId === 'string' ? e.moduleId : '';
    const slideId = typeof e?.slideId === 'string' ? e.slideId : '';
    const mod = lesson.modules.find((m: any) => m.id === moduleId);
    const slide = slidesOf(mod).find((s) => s.id === slideId);
    if (!slide) return { ok: false, error: 'One of those pages is not in this lesson.', status: 400 };
    if (typeof e.markdown !== 'string') return { ok: false, error: 'Page text must be text.', status: 400 };
    if (e.markdown.length > LIMITS.slide) return { ok: false, error: `A page is too long (limit ${LIMITS.slide} characters). Split it with a line of ---.`, status: 400 };
    const key = `${moduleId}/${slideId}`;
    if (seen.has(key)) return { ok: false, error: 'A page was sent twice.', status: 400 };
    seen.add(key);
    const markdown = cleanText(e.markdown, LIMITS.slide);
    if (markdown !== (slide.markdown ?? '')) edits.push({ moduleId, slideId, markdown, before: slide.markdown ?? '' });
  }
  if (edits.length === 0) return { ok: true, changed: 0, lessonFixed: 0, lessonSkipped: 0 };

  for (const e of edits) {
    const slides = slidesOf(lesson.modules.find((m: any) => m.id === e.moduleId));
    slides.find((s) => s.id === e.slideId)!.markdown = e.markdown;
  }
  for (const m of lesson.modules) {
    const total = slidesOf(m).reduce((n, s) => n + (s.markdown ?? '').length, 0);
    if (total > LIMITS.markdown) return { ok: false, error: 'The pages are too long altogether.', status: 400 };
  }
  const res = await db
    .prepare("UPDATE lesson_runs SET snapshot_json = ?2 WHERE id = ?1 AND status = 'ended'")
    .bind(run.id, JSON.stringify(lesson))
    .run();
  if (res?.meta && res.meta.changes === 0) return { ok: false, error: 'Only a finished delivery can be corrected here.', status: 409 };

  let lessonFixed = 0;
  let lessonSkipped = 0;
  if (alsoLesson) {
    const source = await getLesson(db, run.teacherId, run.lessonId);
    if (source) {
      for (const e of edits) {
        const sl = slidesOf(source.modules.find((m: any) => m.id === e.moduleId)).find((s) => s.id === e.slideId);
        if (sl && (sl.markdown ?? '') === e.before) {
          sl.markdown = e.markdown;
          lessonFixed++;
        } else lessonSkipped++;
      }
      if (lessonFixed) await saveLesson(db, source, source, source.modules);
    } else lessonSkipped = edits.length;
  }
  return { ok: true, changed: edits.length, lessonFixed, lessonSkipped };
}
