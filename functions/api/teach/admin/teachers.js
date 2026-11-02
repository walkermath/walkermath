// functions/api/teach/admin/teachers.js
// The teacher list, for admins only (ADMIN_EMAIL).
//
//   GET                                      -> { teachers, boardCodes }
//   POST   { email, boardCode, sandbox, note } -> { teacher }       add
//   PATCH  { email, boardCode?, sandbox?, note? } -> { teacher }    change
//   DELETE ?email=                           -> { ok }             remove (admins can't be removed)
//
// Removing a teacher signs them out and closes their classes to students, but keeps their classes,
// rosters and lessons: adding the same email back restores everything.

import { TEACHERS } from '../../../../src/lib/teachers.ts';
import { fail, json, readJson } from '../../../../src/lib/server/http.ts';
import {
  MAX_ALLOWED_TEACHERS,
  cleanAccountInput,
  findAccount,
  isAdmin,
  listAccounts,
  normalizeEmail
} from '../../../../src/lib/server/accounts.ts';

const forbidden = () => fail('Only an admin can manage teachers.', 403);

export async function onRequestGet({ env, data }) {
  if (!data.teacher.isAdmin) return forbidden();
  const teachers = (await listAccounts(env.DB)).map((t) => ({ ...t, isAdmin: isAdmin(env, t.email) }));
  return json({ teachers, boardCodes: TEACHERS });
}

export async function onRequestPost({ request, env, data }) {
  if (!data.teacher.isAdmin) return forbidden();
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const email = normalizeEmail(body.email);
  if (!email) return fail("That doesn't look like an email address.");
  const clean = cleanAccountInput({ boardCode: body.boardCode ?? TEACHERS[0], sandbox: body.sandbox ?? false, note: body.note ?? '' });
  if (typeof clean === 'string') return fail(clean);

  if (await findAccount(env.DB, email)) return fail('That email is already on the list.', 409);
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM allowed_teachers').first();
  if (n >= MAX_ALLOWED_TEACHERS) return fail('Teacher limit reached.');

  await env.DB.prepare(
    'INSERT INTO allowed_teachers (email, board_code, sandbox, note, added_at) VALUES (?1, ?2, ?3, ?4, ?5)'
  )
    .bind(email, clean.boardCode, clean.sandbox ? 1 : 0, clean.note, Date.now())
    .run();
  return json({ teacher: await findAccount(env.DB, email) }, 201);
}

export async function onRequestPatch({ request, env, data }) {
  if (!data.teacher.isAdmin) return forbidden();
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const email = normalizeEmail(body.email);
  const current = email && (await findAccount(env.DB, email));
  if (!current) return fail('Not found.', 404);
  const clean = cleanAccountInput({ boardCode: body.boardCode, sandbox: body.sandbox, note: body.note });
  if (typeof clean === 'string') return fail(clean);

  const next = { ...current, ...clean };
  await env.DB.prepare('UPDATE allowed_teachers SET board_code = ?2, sandbox = ?3, note = ?4 WHERE email = ?1')
    .bind(email, next.boardCode, next.sandbox ? 1 : 0, next.note)
    .run();
  return json({ teacher: await findAccount(env.DB, email) });
}

export async function onRequestDelete({ request, env, data }) {
  if (!data.teacher.isAdmin) return forbidden();
  const email = normalizeEmail(new URL(request.url).searchParams.get('email'));
  if (!email) return fail('Not found.', 404);
  if (isAdmin(env, email)) return fail("An admin can't be removed here. Change ADMIN_EMAIL instead.");
  const res = await env.DB.prepare('DELETE FROM allowed_teachers WHERE email = ?1').bind(email).run();
  if (!res.meta?.changes) return fail('Not found.', 404);
  return json({ ok: true });
}
