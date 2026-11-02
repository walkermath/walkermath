// functions/api/teach/runs/[runId]/end.js
//   POST -> { ok }   ends the delivery: the room's clock stops and the run is marked ended

import { fail, json } from '../../../../../src/lib/server/http.ts';
import { endRun, getLiveRun } from '../../../../../src/lib/server/live.ts';

export async function onRequestPost({ env, data, params }) {
  const run = await getLiveRun(env.DB, params.runId);
  if (!run || run.teacherId !== data.teacher.id) return fail('Not found.', 404);
  await endRun(env, run);
  return json({ ok: true });
}
