// functions/api/class/board-name.js
//   GET                -> { posting, name, fixed }   the signed-in student's leaderboard name
//   POST { reroll }    -> { posting, name, fixed }   a different name, until a score was posted under it
// The name is generated, never typed, and is separate from the student's lesson alias.

import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { boardStatus } from '../../../src/lib/server/scores.ts';
import { currentStudent } from '../../../src/lib/server/sessions.ts';

export async function onRequestGet({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  return json(await boardStatus(env.DB, s, { profanityList: env.PROFANITY_BLOCKLIST }));
}

export async function onRequestPost({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const status = await boardStatus(env.DB, s, { reroll: body.reroll === true, profanityList: env.PROFANITY_BLOCKLIST });
  if (body.reroll === true && status.fixed) return fail("Your leaderboard name is set once you've posted a score.", 409);
  return json(status);
}
