// functions/api/teach/library/index.js
//   GET                -> { entries: [...] }   every shared lesson, newest first (signed-in teachers only)
//   POST { lessonId }  -> { entry }            share one of your lessons, or refresh its shared copy

import { fail, json, readJson } from '../../../../src/lib/server/http.ts';
import { listLibrary, shareLesson } from '../../../../src/lib/server/library.ts';

export async function onRequestGet({ env, data }) {
  return json({ entries: await listLibrary(env.DB, data.teacher.id) });
}

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const entry = await shareLesson(env.DB, data.teacher.id, body.lessonId);
  if (!entry) return fail('Not found.', 404);
  return json({ entry });
}
