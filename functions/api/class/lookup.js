// functions/api/class/lookup.js
//   POST { passcode } -> { class: { name, period, test } }
// Step 1 of joining: confirm the class code before asking for alias and PIN.

import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { WRONG_CODE, classForPasscode, joinGate } from '../../../src/lib/server/join.ts';

export async function onRequestPost({ request, env }) {
  const blocked = await joinGate(env, request);
  if (blocked) return blocked;

  const body = await readJson(request);
  const cls = await classForPasscode(env, body?.passcode);
  if (!cls) return fail(WRONG_CODE, 404);
  return json({ class: { name: cls.name, period: cls.period, test: cls.test } });
}
