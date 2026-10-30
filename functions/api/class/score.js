// functions/api/class/score.js
//   POST { game, event, level?, variant?, tags?, score, duration_ms, post?, runId?, moduleId? } -> { kept, posted, name }
//        post: false keeps the score for the teacher without posting it (the student skipped posting).
//        runId + moduleId: the live lesson's Coliseum module it was played in (kept only if that checks out).
// A Coliseum game finished inside a lesson. Who played comes from the student's session, never
// from the request. The result is kept for the teacher; it is posted to the public leaderboard
// only when the class has posting on, under the student's leaderboard name.

import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { cleanGameScore } from '../../../src/lib/server/leaderboard.ts';
import { recordLessonScore } from '../../../src/lib/server/scores.ts';
import { currentStudent } from '../../../src/lib/server/sessions.ts';
import { scoreTarget } from '../../../src/lib/server/submissions.ts';

export async function onRequestPost({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const score = cleanGameScore(body);
  if (typeof score === 'string') return fail(score);
  const target = body.runId ? await scoreTarget(env.DB, s, body.runId, body.moduleId) : null;
  return json(
    await recordLessonScore(env.DB, s, score, { profanityList: env.PROFANITY_BLOCKLIST, post: body.post !== false, target }),
    201
  );
}
