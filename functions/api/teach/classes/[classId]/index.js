// functions/api/teach/classes/[classId]/index.js
//   GET    -> { class, aliases }
//   PATCH  { name?, period?, bellStart?, bellEnd?, archived? } -> { class }
//   DELETE -> removes the class, its aliases and their sessions (sandbox clean-up, or a class made by mistake)

import { cleanClassName, isBellTime, isPeriod } from '../../../../../src/lib/classroom.ts';
import { fail, json, readJson } from '../../../../../src/lib/server/http.ts';
import { listAliases, ownedClass } from '../../../../../src/lib/server/classes.ts';

const notFound = () => fail('Class not found.', 404);

export async function onRequestGet({ env, data, params }) {
  const cls = await ownedClass(env.DB, data.teacher.id, params.classId);
  if (!cls) return notFound();
  return json({ class: cls, aliases: await listAliases(env.DB, cls.id) });
}

export async function onRequestPatch({ request, env, data, params }) {
  const cls = await ownedClass(env.DB, data.teacher.id, params.classId);
  if (!cls) return notFound();
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');

  const next = { ...cls };
  if ('name' in body) {
    next.name = cleanClassName(body.name);
    if (!next.name) return fail('Give the class a name.');
  }
  if ('period' in body) {
    next.period = String(body.period || '').toUpperCase();
    if (!isPeriod(next.period)) return fail('Pick a period (P0-P9).');
  }
  for (const key of ['bellStart', 'bellEnd']) {
    if (key in body) {
      const v = body[key] || null;
      if (v && !isBellTime(v)) return fail('Bell times look wrong.');
      next[key] = v;
    }
  }
  if (next.bellStart && next.bellEnd && next.bellEnd <= next.bellStart) {
    return fail('The class has to end after it starts.');
  }
  if ('archived' in body) next.archived = !!body.archived;

  await env.DB.prepare(
    'UPDATE classes SET name = ?2, period = ?3, bell_start = ?4, bell_end = ?5, archived = ?6 WHERE id = ?1'
  )
    .bind(cls.id, next.name, next.period, next.bellStart, next.bellEnd, next.archived ? 1 : 0)
    .run();
  return json({ class: await ownedClass(env.DB, data.teacher.id, cls.id) });
}

export async function onRequestDelete({ env, data, params }) {
  const cls = await ownedClass(env.DB, data.teacher.id, params.classId);
  if (!cls) return notFound();
  await env.DB.prepare('DELETE FROM classes WHERE id = ?1').bind(cls.id).run();
  return json({ ok: true });
}
