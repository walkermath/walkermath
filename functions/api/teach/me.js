// functions/api/teach/me.js
//   GET                 -> { teacher }
//   PATCH { timeZone }  -> { teacher }   (the browser reports its IANA time zone; used for lesson times)
import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { isTimeZone } from '../../../src/lib/lesson/time.ts';

const view = (t) => ({
  email: t.email,
  displayName: t.displayName,
  boardCode: t.boardCode,
  sandbox: t.sandbox,
  timeZone: t.timeZone,
  isAdmin: t.isAdmin
});

export function onRequestGet({ data }) {
  return json({ teacher: view(data.teacher) });
}

export async function onRequestPatch({ request, env, data }) {
  const body = await readJson(request);
  if (!body || !isTimeZone(body.timeZone)) return fail('Unknown time zone.');
  await env.DB.prepare('UPDATE teachers SET time_zone = ?2 WHERE id = ?1').bind(data.teacher.id, body.timeZone).run();
  return json({ teacher: view({ ...data.teacher, timeZone: body.timeZone }) });
}
