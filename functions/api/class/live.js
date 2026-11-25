// functions/api/class/live.js
//   GET -> { runs: [{ id, lessonTitle, startsAt }] }   lessons the signed-in student's class can join now
//
// Checking also opens any scheduled delivery of the class whose early-join window has come
// (src/lib/server/live.ts openDueRuns), so a lesson opens and then starts itself at its start time.

import { fail, json } from '../../../src/lib/server/http.ts';
import { liveRunsForClass, openDueRuns } from '../../../src/lib/server/live.ts';
import { currentStudent } from '../../../src/lib/server/sessions.ts';

export async function onRequestGet({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  await openDueRuns(env, s.classId).catch(() => null); // joining still works for lessons already open
  const runs = await liveRunsForClass(env.DB, s.classId);
  return json({ runs: runs.map((r) => ({ id: r.id, lessonTitle: r.lessonTitle, startsAt: r.scheduledStart })) });
}
