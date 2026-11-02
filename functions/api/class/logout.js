// functions/api/class/logout.js
// "Not you? Switch": signs this device out.

import { json } from '../../../src/lib/server/http.ts';
import { endStudentSession } from '../../../src/lib/server/sessions.ts';

export async function onRequestPost({ request, env }) {
  const cookie = await endStudentSession(env.DB, request);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}
