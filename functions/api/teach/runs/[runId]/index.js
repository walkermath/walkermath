// functions/api/teach/runs/[runId]/index.js
//   GET -> { run }   one of your deliveries (for the control panel's header)

import { fail, json } from '../../../../../src/lib/server/http.ts';
import { getLiveRun } from '../../../../../src/lib/server/live.ts';

export async function onRequestGet({ env, data, params }) {
  const run = await getLiveRun(env.DB, params.runId);
  if (!run || run.teacherId !== data.teacher.id) return fail('Not found.', 404);
  return json({ run });
}
