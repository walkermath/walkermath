// functions/api/teach/runs/[runId]/feedback.js
//   POST { moduleId, aliasId, questionId, mark, message } -> { feedback }
//        mark: 'right' | 'partial' | 'wrong' | null; message: plain text, up to 400 characters.
//        No mark and no message clears it ({ feedback: null }).
// Your mark and message on one student's answer in an Active Feedback activity, during the lesson
// or after it. (The feedback already given comes with GET .../answers.)

import { fail, json, readJson } from '../../../../../src/lib/server/http.ts';
import { saveFeedback } from '../../../../../src/lib/server/feedback.ts';
import { getLiveRun, nudgeRoom } from '../../../../../src/lib/server/live.ts';

export async function onRequestPost({ request, env, data, params }) {
  const run = await getLiveRun(env.DB, params.runId);
  if (!run || run.teacherId !== data.teacher.id) return fail('Not found.', 404);
  const body = await readJson(request, 4096);
  if (!body) return fail('Invalid request.');
  const r = await saveFeedback(env.DB, run, body);
  if (!r.ok) return fail(r.error, r.status);
  // While the lesson is live, that student's devices fetch it right away (marking later waits for them to look back).
  if (run.status === 'live') await nudgeRoom(env, run.id, { kind: 'feedback', aliasId: String(body.aliasId) });
  return json({ feedback: r.feedback });
}
