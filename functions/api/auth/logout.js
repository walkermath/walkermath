// functions/api/auth/logout.js
// Signs the teacher out on this device.

import { isAllowedOrigin, json } from '../../../src/lib/server/http.ts';
import { endTeacherSession } from '../../../src/lib/server/sessions.ts';

export async function onRequestPost({ request, env }) {
  if (!isAllowedOrigin(request)) return json({ error: 'Bad origin.' }, 403);
  const cookie = await endTeacherSession(env.DB, request);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}
