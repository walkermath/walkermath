// functions/api/teach/runs.js
//   GET -> { runs }   live and upcoming deliveries across all of this teacher's lessons (teach home)

import { json } from '../../../src/lib/server/http.ts';
import { upcomingRuns } from '../../../src/lib/server/lessons.ts';

export async function onRequestGet({ env, data }) {
  return json({ runs: await upcomingRuns(env.DB, data.teacher.id, Date.now()) });
}
