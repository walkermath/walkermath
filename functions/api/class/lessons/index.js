// functions/api/class/lessons/index.js
//   GET -> { past: [{ runId, title, date, startTime }], upcoming: [...] }
// The signed-in student's class: finished lessons to look back at, and the next few scheduled.

import { fail, json } from '../../../../src/lib/server/http.ts';
import { currentStudent } from '../../../../src/lib/server/sessions.ts';
import { classLessons } from '../../../../src/lib/server/studentLessons.ts';

export async function onRequestGet({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  return json(await classLessons(env.DB, s));
}
