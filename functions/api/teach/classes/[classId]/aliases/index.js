// functions/api/teach/classes/[classId]/aliases/index.js
//   GET  -> { aliases }
//   POST { count } -> { created: [{ id, alias, pin }] }
// PINs are returned once, in this response only, for the printable cards and the CSV.

import { fail, json, readJson } from '../../../../../../src/lib/server/http.ts';
import {
  MAX_ALIASES_PER_CLASS,
  MAX_ALIASES_PER_REQUEST,
  createAliases,
  listAliases,
  ownedClass
} from '../../../../../../src/lib/server/classes.ts';

export async function onRequestGet({ env, data, params }) {
  const cls = await ownedClass(env.DB, data.teacher.id, params.classId);
  if (!cls) return fail('Class not found.', 404);
  return json({ aliases: await listAliases(env.DB, cls.id) });
}

export async function onRequestPost({ request, env, data, params }) {
  if (!env.AUTH_SECRET) return fail('AUTH_SECRET is not set.', 503);
  const cls = await ownedClass(env.DB, data.teacher.id, params.classId);
  if (!cls) return fail('Class not found.', 404);

  const body = await readJson(request);
  const count = Number(body?.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_ALIASES_PER_REQUEST) {
    return fail(`Choose between 1 and ${MAX_ALIASES_PER_REQUEST} students.`);
  }

  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM student_aliases WHERE class_id = ?1').bind(cls.id).first();
  if (n + count > MAX_ALIASES_PER_CLASS) {
    return fail(`A class can have at most ${MAX_ALIASES_PER_CLASS} aliases (this one has ${n}).`);
  }

  const created = await createAliases(env.DB, env.AUTH_SECRET, cls.id, count);
  return json({ created }, 201);
}
