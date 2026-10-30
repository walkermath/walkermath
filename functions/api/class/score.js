// functions/api/class/score.js
//   POST { game, event, level?, variant?, tags?, score, duration_ms, post? } -> { kept, posted, name }
//        post: false keeps the score for the teacher without posting it (the student skipped posting).
// A Coliseum game finished inside a lesson. Who played comes from the student's session, never
// from the request. The result is kept for the teacher; it is posted to the public leaderboard
// only when the class has posting on, under the student's leaderboard name.

import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { cleanGameScore } from '../../../src/lib/server/leaderboard.ts';
import { recordLessonScore } from '../../../src/lib/server/scores.ts';
import { currentStudent } from '../../../src/lib/server/sessions.ts';

export async function onRequestPost({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const score = cleanGameScore(body);
  if (typeof score === 'string') return fail(score);
  return json(
    await recordLessonScore(env.DB, s, score, { profanityList: env.PROFANITY_BLOCKLIST, post: body.post !== false }),
    201
  );
}
