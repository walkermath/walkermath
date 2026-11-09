// functions/api/class/feedback.js
//   GET ?run=<runId> -> { feedback: { moduleId: { questionId: { mark, message, answer, at } } } }
// The teacher's marks and messages on the signed-in student's own answers in a live lesson (Active
// Feedback activities). Never anyone else's. A finished lesson's feedback comes with /api/class/lessons/:runId.

import { fail, json } from '../../../src/lib/server/http.ts';
import { studentFeedback } from '../../../src/lib/server/feedback.ts';
import { currentStudent } from '../../../src/lib/server/sessions.ts';
import { studentRun } from '../../../src/lib/server/submissions.ts';

export async function onRequestGet({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const run = await studentRun(env.DB, s, new URL(request.url).searchParams.get('run'));
  if (!run) return fail('Not found.', 404);
  return json({ feedback: await studentFeedback(env.DB, run.id, s.aliasId) });
}
