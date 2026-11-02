// functions/api/teach/classes/[classId]/passcode.js
//   POST { signOutAll? } -> { class }
// New class passcode. With signOutAll, every student device in the class must sign in again.

import { fail, json, readJson } from '../../../../../src/lib/server/http.ts';
import { ownedClass, signOutClass, withFreshPasscode } from '../../../../../src/lib/server/classes.ts';

export async function onRequestPost({ request, env, data, params }) {
  const cls = await ownedClass(env.DB, data.teacher.id, params.classId);
  if (!cls) return fail('Class not found.', 404);
  const body = (await readJson(request)) || {};

  await withFreshPasscode((passcode) =>
    env.DB.prepare('UPDATE classes SET passcode = ?2 WHERE id = ?1').bind(cls.id, passcode).run()
  );
  if (body.signOutAll) await signOutClass(env.DB, cls.id);

  return json({ class: await ownedClass(env.DB, data.teacher.id, cls.id) });
}
