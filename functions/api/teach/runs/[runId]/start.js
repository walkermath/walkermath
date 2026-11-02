// functions/api/teach/runs/[runId]/start.js
//   POST -> { runId, state, serverNow }   starts the delivery (or reopens its live room)

import { fail, json } from '../../../../../src/lib/server/http.ts';
import { getLiveRun, startRun } from '../../../../../src/lib/server/live.ts';

export async function onRequestPost({ env, data, params }) {
  const run = await getLiveRun(env.DB, params.runId);
  if (!run || run.teacherId !== data.teacher.id) return fail('Not found.', 404);
  const started = await startRun(env, run);
  if (!started.ok) return fail(started.error, started.status);
  return json({ runId: run.id, ...started.room });
}
