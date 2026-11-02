// functions/api/teach/classes/[classId]/aliases/[aliasId]/pin.js
//   POST -> { id, alias, pin }
// New PIN for one alias (a lost card). Signs that alias out everywhere and clears its lockout.
// The new PIN is returned once, for a single replacement card.

import { generatePin } from '../../../../../../../src/lib/classroom.ts';
import { fail, json } from '../../../../../../../src/lib/server/http.ts';
import { ownedClass, pinHash, signOutAlias } from '../../../../../../../src/lib/server/classes.ts';
import { pinLimit, reset } from '../../../../../../../src/lib/server/rateLimit.ts';

export async function onRequestPost({ env, data, params }) {
  if (!env.AUTH_SECRET) return fail('AUTH_SECRET is not set.', 503);
  const cls = await ownedClass(env.DB, data.teacher.id, params.classId);
  if (!cls) return fail('Class not found.', 404);

  const aliasId = String(params.aliasId);
  const row = await env.DB.prepare('SELECT alias FROM student_aliases WHERE id = ?1 AND class_id = ?2')
    .bind(aliasId, cls.id)
    .first();
  if (!row) return fail('Alias not found.', 404);

  const pin = generatePin();
  await env.DB.prepare('UPDATE student_aliases SET pin_hash = ?2 WHERE id = ?1')
    .bind(aliasId, await pinHash(env.AUTH_SECRET, aliasId, pin))
    .run();
  await signOutAlias(env.DB, aliasId);
  await reset(env.DB, pinLimit(aliasId));

  return json({ id: aliasId, alias: row.alias, pin });
}
