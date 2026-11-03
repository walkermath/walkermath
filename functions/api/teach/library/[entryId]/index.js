// functions/api/teach/library/[entryId]/index.js
//   GET    -> { lesson }   a shared lesson in full, to look at before copying
//   DELETE -> { ok }       take your own lesson out of the library

import { fail, json } from '../../../../../src/lib/server/http.ts';
import { libraryLesson, unshare } from '../../../../../src/lib/server/library.ts';

export async function onRequestGet({ env, params }) {
  const lesson = await libraryLesson(env.DB, params.entryId);
  if (!lesson) return fail('Not found.', 404);
  return json({ lesson });
}

export async function onRequestDelete({ env, data, params }) {
  if (!(await unshare(env.DB, data.teacher.id, params.entryId))) return fail('Not found.', 404);
  return json({ ok: true });
}
