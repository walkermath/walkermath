// functions/api/class/signin.js
//   POST { passcode, alias, pin } -> { student }  (+ session cookie)
// Step 2 of joining. A wrong alias and a wrong PIN get the same answer, so the form can't be used
// to discover which aliases exist. Five wrong PINs for one alias lock it for 10 minutes.

import { isPinShape, normalizeAliasInput } from '../../../src/lib/classroom.ts';
import { safeEqual } from '../../../src/lib/server/crypto.ts';
import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { pinHash } from '../../../src/lib/server/classes.ts';
import { WRONG_CODE, classForPasscode, joinGate } from '../../../src/lib/server/join.ts';
import { bump, peek, pinLimit, reset } from '../../../src/lib/server/rateLimit.ts';
import { currentStudent, endStudentSession, publicStudent, startStudentSession } from '../../../src/lib/server/sessions.ts';

const NO_MATCH = "That alias and PIN don't match. Check your card and try again.";

export async function onRequestPost({ request, env }) {
  const blocked = await joinGate(env, request);
  if (blocked) return blocked;

  const body = await readJson(request);
  const cls = await classForPasscode(env, body?.passcode);
  if (!cls) return fail(WRONG_CODE, 404);

  const aliasLower = normalizeAliasInput(body?.alias);
  const pin = typeof body?.pin === 'string' ? body.pin.replace(/\s+/g, '') : '';
  if (!aliasLower || !isPinShape(pin)) return fail(NO_MATCH, 401);

  const row = await env.DB.prepare(
    'SELECT id, pin_hash FROM student_aliases WHERE class_id = ?1 AND alias_lower = ?2 AND retired = 0'
  )
    .bind(cls.id, aliasLower)
    .first();
  if (!row) return fail(NO_MATCH, 401);

  const limit = pinLimit(row.id);
  if ((await peek(env.DB, limit)) >= limit.max) {
    return fail('Too many wrong PINs for this alias. Wait 10 minutes, or ask your teacher for a new card.', 429);
  }
  if (!safeEqual(await pinHash(env.AUTH_SECRET, row.id, pin), row.pin_hash)) {
    await bump(env.DB, limit);
    return fail(NO_MATCH, 401);
  }
  await reset(env.DB, limit);

  // Switching students on this device: end the previous session first.
  await endStudentSession(env.DB, request);
  const cookie = await startStudentSession(env.DB, row.id);

  // Read back through the same path every later request uses.
  const student = await currentStudent(env, new Request(request.url, { headers: { Cookie: cookie.split(';')[0] } }));
  return json({ student: student && publicStudent(student) }, 200, { 'Set-Cookie': cookie });
}
