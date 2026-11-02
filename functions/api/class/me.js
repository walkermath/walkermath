// functions/api/class/me.js
//   GET -> { student } or { student: null }

import { json } from '../../../src/lib/server/http.ts';
import { currentStudent, publicStudent } from '../../../src/lib/server/sessions.ts';

export async function onRequestGet({ request, env }) {
  const s = await currentStudent(env, request);
  return json({ student: s && publicStudent(s) });
}
