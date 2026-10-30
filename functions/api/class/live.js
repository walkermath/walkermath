// functions/api/class/live.js
//   GET -> { runs: [{ id, lessonTitle }] }   live lessons the signed-in student's class is in now

import { fail, json } from '../../../src/lib/server/http.ts';
import { liveRunsForClass } from '../../../src/lib/server/live.ts';
import { currentStudent } from '../../../src/lib/server/sessions.ts';

export async function onRequestGet({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const runs = await liveRunsForClass(env.DB, s.classId);
  return json({ runs: runs.map((r) => ({ id: r.id, lessonTitle: r.lessonTitle })) });
}
