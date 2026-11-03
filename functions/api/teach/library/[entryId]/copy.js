// functions/api/teach/library/[entryId]/copy.js
//   POST -> { lesson }   copy a shared lesson into your own lessons (keys and notes included)

import { fail, json } from '../../../../../src/lib/server/http.ts';
import { MAX_LESSONS, getLesson } from '../../../../../src/lib/server/lessons.ts';
import { copyFromLibrary } from '../../../../../src/lib/server/library.ts';

export async function onRequestPost({ env, data, params }) {
  const teacherId = data.teacher.id;
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM lessons WHERE teacher_id = ?1').bind(teacherId).first();
  if (n >= MAX_LESSONS) return fail('Lesson limit reached. Delete some old lessons first.');
  const made = await copyFromLibrary(env.DB, teacherId, params.entryId);
  if (made === null) return fail('Not found.', 404);
  if (typeof made === 'string') return fail(made);
  return json({ lesson: await getLesson(env.DB, teacherId, made.id) }, 201);
}
