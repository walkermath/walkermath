// functions/api/teach/lessons/index.js
//   GET                          -> { lessons: [...] }   (summaries, newest first, archived last)
//   POST { title?, copyFrom? }   -> { lesson }           new lesson (bellwork + exit ticket), or a copy of one of yours

import { fail, json, readJson } from '../../../../src/lib/server/http.ts';
import { DEFAULT_LESSON_SEC, cleanLine, LIMITS, starterModules } from '../../../../src/lib/lesson/modules.ts';
import { MAX_LESSONS, createLesson, getLesson, listLessons } from '../../../../src/lib/server/lessons.ts';

export async function onRequestGet({ env, data }) {
  return json({ lessons: await listLessons(env.DB, data.teacher.id) });
}

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const teacherId = data.teacher.id;

  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM lessons WHERE teacher_id = ?1').bind(teacherId).first();
  if (n >= MAX_LESSONS) return fail('Lesson limit reached. Delete some old lessons first.');

  let id;
  if (body.copyFrom !== undefined) {
    const src = await getLesson(env.DB, teacherId, body.copyFrom);
    if (!src) return fail('Not found.', 404);
    const title = cleanLine(`${src.title} (copy)`, LIMITS.lessonTitle);
    const modules = src.modules.map((m) => ({
      ...m,
      id: crypto.randomUUID(),
      config:
        m.type === 'prompt'
          ? { questions: m.config.questions.map((q) => ({ ...q, id: crypto.randomUUID() })) }
          : m.config
    }));
    id = await createLesson(env.DB, teacherId, { ...src, title }, modules);
  } else {
    const title = cleanLine(body.title, LIMITS.lessonTitle) || 'Untitled lesson';
    // New lessons start with a locked Bellwork (5:00) and a locked Exit ticket (4:00).
    id = await createLesson(
      env.DB,
      teacherId,
      { title, topic: '', objective: '', successCriteria: '', standards: '', resources: [], durationSec: DEFAULT_LESSON_SEC },
      starterModules()
    );
  }
  return json({ lesson: await getLesson(env.DB, teacherId, id) }, 201);
}
