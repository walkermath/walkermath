// functions/api/teach/classes/[classId]/aliases/[aliasId]/index.js
//   PATCH { retired } -> { ok }
// Retiring an alias signs its devices out and stops it signing in; un-retiring brings it back.

import { fail, json, readJson } from '../../../../../../../src/lib/server/http.ts';
import { ownedClass, signOutAlias } from '../../../../../../../src/lib/server/classes.ts';

export async function onRequestPatch({ request, env, data, params }) {
  const cls = await ownedClass(env.DB, data.teacher.id, params.classId);
  if (!cls) return fail('Class not found.', 404);
  const body = await readJson(request);
  if (!body || typeof body.retired !== 'boolean') return fail('Invalid request.');

  const res = await env.DB.prepare('UPDATE student_aliases SET retired = ?3 WHERE id = ?1 AND class_id = ?2')
    .bind(String(params.aliasId), cls.id, body.retired ? 1 : 0)
    .run();
  if (!res.meta?.changes) return fail('Alias not found.', 404);
  if (body.retired) await signOutAlias(env.DB, String(params.aliasId));
  return json({ ok: true });
}
