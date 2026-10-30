// functions/api/teach/classes/index.js
//   GET  -> { classes: [...] }
//   POST { name, period, bellStart?, bellEnd? } -> { class }

import { cleanClassName, isBellTime, isPeriod } from '../../../../src/lib/classroom.ts';
import { newId } from '../../../../src/lib/server/crypto.ts';
import { fail, json, readJson } from '../../../../src/lib/server/http.ts';
import { listClasses, ownedClass, withFreshPasscode } from '../../../../src/lib/server/classes.ts';

const MAX_CLASSES = 40;

export async function onRequestGet({ env, data }) {
  return json({ classes: await listClasses(env.DB, data.teacher.id) });
}

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');

  const name = cleanClassName(body.name);
  const period = String(body.period || '').toUpperCase();
  const bellStart = body.bellStart || null;
  const bellEnd = body.bellEnd || null;
  if (!name) return fail('Give the class a name.');
  if (!isPeriod(period)) return fail('Pick a period (P0-P9).');
  if ((bellStart && !isBellTime(bellStart)) || (bellEnd && !isBellTime(bellEnd))) return fail('Bell times look wrong.');
  if (bellStart && bellEnd && bellEnd <= bellStart) return fail('The class has to end after it starts.');

  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM classes WHERE teacher_id = ?1').bind(data.teacher.id).first();
  if (n >= MAX_CLASSES) return fail('Class limit reached. Archive or delete an old class first.');

  const id = newId();
  await withFreshPasscode((passcode) =>
    env.DB.prepare(
      `INSERT INTO classes (id, teacher_id, name, period, passcode, bell_start, bell_end, archived, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)`
    )
      .bind(id, data.teacher.id, name, period, passcode, bellStart, bellEnd, Date.now())
      .run()
  );
  return json({ class: await ownedClass(env.DB, data.teacher.id, id) }, 201);
}
