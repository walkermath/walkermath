// End-to-end check of the Phase 2 Pages Functions against a D1 stand-in built on node:sqlite.
// Run from the repo root (no npm install needed, Node 22.6+):
//   npm run test:lessons
// Uses node:sqlite as a stand-in for D1 and a fake Google token endpoint.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const repo = process.argv[2] || process.cwd();
const load = (p) => import(pathToFileURL(`${repo}/${p}`).href);

/* ---------- D1 stand-in ---------- */
function makeD1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON;');
  sql.exec(readFileSync(`${repo}/migrations/0001_teachers_classes.sql`, 'utf8'));
  const stmt = (text, args = []) => ({
    bind: (...a) => stmt(text, a),
    async first() { const r = sql.prepare(text).all(...args); return r[0] ?? null; },
    async all() { return { results: sql.prepare(text).all(...args) }; },
    async run() { const r = sql.prepare(text).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _exec() { return sql.prepare(text).run(...args); }
  });
  return {
    sql,
    prepare: (text) => stmt(text),
    async batch(list) {
      sql.exec('BEGIN');
      try { for (const s of list) s._exec(); sql.exec('COMMIT'); }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
    }
  };
}

const ORIGIN = 'http://localhost:8788';
const env = {
  DB: makeD1(),
  AUTH_SECRET: 'test-secret-'.repeat(4),
  GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'shh',
  TEACHER_ACCOUNTS: 'walkerb@castleberryisd.net=WALKER, brett@example.com=WALKER:sandbox'
};

/* ---------- request helpers ---------- */
const jar = { teacher: '', student: '' };
function req(path, { method = 'GET', body, cookie = '', origin = ORIGIN, headers = {} } = {}) {
  const h = new Headers(headers);
  if (cookie) h.set('Cookie', cookie);
  if (origin && method !== 'GET') h.set('Origin', origin);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new Request(ORIGIN + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookieOf = (res, name) => {
  const all = res.headers.getSetCookie?.() ?? [res.headers.get('Set-Cookie')];
  const c = all.find((v) => v && v.startsWith(name + '='));
  return c ? c.split(';')[0] : null;
};
async function call(mod, method, request, params = {}, middleware) {
  const handler = mod[`onRequest${method[0]}${method.slice(1).toLowerCase()}`] ?? mod.onRequest;
  const context = { request, env, params, data: {} };
  if (middleware) {
    context.next = () => handler(context);
    return middleware.onRequest(context);
  }
  return handler(context);
}
const body = async (res) => res.json();

/* ---------- modules ---------- */
const start = await load('functions/api/auth/google/start.js');
const callback = await load('functions/api/auth/google/callback.js');
const logout = await load('functions/api/auth/logout.js');
const teachMw = await load('functions/api/teach/_middleware.js');
const me = await load('functions/api/teach/me.js');
const classesIdx = await load('functions/api/teach/classes/index.js');
const classOne = await load('functions/api/teach/classes/[classId]/index.js');
const passcodeR = await load('functions/api/teach/classes/[classId]/passcode.js');
const aliasesR = await load('functions/api/teach/classes/[classId]/aliases/index.js');
const aliasOne = await load('functions/api/teach/classes/[classId]/aliases/[aliasId]/index.js');
const pinR = await load('functions/api/teach/classes/[classId]/aliases/[aliasId]/pin.js');
const classMw = await load('functions/api/class/_middleware.js');
const lookup = await load('functions/api/class/lookup.js');
const signin = await load('functions/api/class/signin.js');
const sme = await load('functions/api/class/me.js');
const slogout = await load('functions/api/class/logout.js');
const { isValidAlias } = await load('src/lib/pseudonym.ts');

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let passed = 0;
const ok = (name) => { passed++; console.log('  ok  ' + name); };

/* ---------- Google sign-in ---------- */
async function signInTeacher(email, sub, tweak = {}) {
  const r1 = await call(start, 'GET', req('/api/auth/google/start'));
  assert.equal(r1.status, 303);
  const loc = new URL(r1.headers.get('Location'));
  assert.equal(loc.host, 'accounts.google.com');
  const oauth = cookieOf(r1, '__Host-wm_oauth');
  const nonce = loc.searchParams.get('nonce');
  const state = loc.searchParams.get('state');
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('redirect_uri'), ORIGIN + '/api/auth/google/callback');
    assert.ok(form.get('code_verifier'));
    const claims = { iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: Date.now() / 1000 + 300,
      nonce, email_verified: true, sub, email, name: 'B. Walker', ...tweak };
    return new Response(JSON.stringify({ id_token: `x.${b64u(claims)}.y` }), { status: 200 });
  };
  const r2 = await call(callback, 'GET', req(`/api/auth/google/callback?code=abc&state=${tweak.badState ? 'nope' : state}`, { cookie: oauth }));
  return { res: r2, location: r2.headers.get('Location'), session: cookieOf(r2, '__Host-wm_teacher') };
}

console.log('teacher sign-in');
{
  const denied = await signInTeacher('stranger@gmail.com', 'g-999');
  assert.equal(denied.location, '/teach?signin=denied');
  assert.equal(denied.session, null);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM teachers').first()).n, 0);
  ok('unlisted Google account is refused and nothing is stored');

  const badNonce = await signInTeacher('walkerb@castleberryisd.net', 'g-1', { nonce: 'forged' });
  assert.equal(badNonce.location, '/teach?signin=failed');
  ok('wrong nonce is refused');

  const wrongAud = await signInTeacher('walkerb@castleberryisd.net', 'g-1', { aud: 'someone-else' });
  assert.equal(wrongAud.location, '/teach?signin=failed');
  ok('token for another app is refused');

  const unverified = await signInTeacher('walkerb@castleberryisd.net', 'g-1', { email_verified: false });
  assert.equal(unverified.location, '/teach?signin=failed');
  ok('unverified email is refused');

  const badState = await signInTeacher('walkerb@castleberryisd.net', 'g-1', { badState: true });
  assert.equal(badState.location, '/teach?signin=expired');
  ok('state mismatch is refused');

  const good = await signInTeacher('WalkerB@castleberryisd.net', 'g-1');
  assert.equal(good.location, '/teach');
  assert.ok(good.session);
  jar.teacher = good.session;
  const row = await env.DB.prepare('SELECT * FROM teacher_sessions').first();
  assert.notEqual(row.token_hash, good.session.split('=')[1]);
  ok('listed account signs in; only a hash of the session token is stored');

  const again = await signInTeacher('walkerb@castleberryisd.net', 'g-1');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM teachers').first()).n, 1);
  jar.teacher = again.session;
  ok('signing in again reuses the same teacher row');
}

const T = (path, opts = {}) => req(path, { cookie: jar.teacher, ...opts });

console.log('teacher API');
{
  const r = await call(me, 'GET', T('/api/teach/me'), {}, teachMw);
  const d = await body(r);
  assert.equal(d.teacher.boardCode, 'WALKER');
  assert.equal(d.teacher.sandbox, false);
  ok('/api/teach/me returns the teacher');

  assert.equal((await call(me, 'GET', req('/api/teach/me'), {}, teachMw)).status, 401);
  ok('no cookie -> 401');

  const noOrigin = await call(classesIdx, 'POST', T('/api/teach/classes', { method: 'POST', body: { name: 'X', period: 'P1' }, origin: '' }), {}, teachMw);
  assert.equal(noOrigin.status, 403);
  const evil = await call(classesIdx, 'POST', T('/api/teach/classes', { method: 'POST', body: { name: 'X', period: 'P1' }, origin: 'https://evil.example' }), {}, teachMw);
  assert.equal(evil.status, 403);
  ok('writes without this site as Origin are refused');

  for (const [bad, why] of [[{ name: '', period: 'P1' }, 'empty name'], [{ name: 'A', period: 'P10' }, 'bad period'],
    [{ name: 'A', period: 'P1', bellStart: '25:00' }, 'bad time'], [{ name: 'A', period: 'P1', bellStart: '10:00', bellEnd: '09:00' }, 'end before start']]) {
    const res = await call(classesIdx, 'POST', T('/api/teach/classes', { method: 'POST', body: bad }), {}, teachMw);
    assert.equal(res.status, 400, why);
  }
  ok('class validation rejects bad input');
}

let cls, aliases;
{
  const res = await call(classesIdx, 'POST', T('/api/teach/classes', { method: 'POST', body: { name: '  Algebra   II ', period: 'p3', bellStart: '09:51', bellEnd: '10:44' } }), {}, teachMw);
  assert.equal(res.status, 201);
  cls = (await body(res)).class;
  assert.equal(cls.name, 'Algebra II');
  assert.equal(cls.period, 'P3');
  assert.match(cls.passcode, /^[A-Z]{2,8}-\d{3}$/);
  ok(`class created with code ${cls.passcode}`);

  const made = await call(aliasesR, 'POST', T(`/api/teach/classes/${cls.id}/aliases`, { method: 'POST', body: { count: 30 } }), { classId: cls.id }, teachMw);
  assert.equal(made.status, 201);
  aliases = (await body(made)).created;
  assert.equal(aliases.length, 30);
  assert.ok(aliases.every((a) => isValidAlias(a.alias) && /^\d{6}$/.test(a.pin)));
  assert.equal(new Set(aliases.map((a) => a.alias.toLowerCase())).size, 30);
  const stored = await env.DB.prepare('SELECT pin_hash FROM student_aliases').all();
  assert.ok(stored.results.every((r) => /^[0-9a-f]{64}$/.test(r.pin_hash)));
  ok('30 aliases made: all pass isValidAlias (leaderboard-compatible), PINs stored only as HMACs');

  const tooMany = await call(aliasesR, 'POST', T(`/api/teach/classes/${cls.id}/aliases`, { method: 'POST', body: { count: 60 } }), { classId: cls.id }, teachMw);
  assert.equal(tooMany.status, 400);
  ok('per-class alias cap enforced');

  // Another teacher's class is invisible.
  const other = await signInTeacher('brett@example.com', 'g-2');
  const peek = await call(classOne, 'GET', req(`/api/teach/classes/${cls.id}`, { cookie: other.session }), { classId: cls.id }, teachMw);
  assert.equal(peek.status, 404);
  ok("another teacher can't see this class");
}

console.log('student join');
let studentCookie;
{
  const S = (path, opts = {}) => req(path, { cookie: jar.student, ...opts });
  const wrongCode = await call(lookup, 'POST', S('/api/class/lookup', { method: 'POST', body: { passcode: 'NOPE-000' } }), {}, classMw);
  assert.equal(wrongCode.status, 404);
  const typed = cls.passcode.toLowerCase().replace('-', ' ');
  const found = await call(lookup, 'POST', S('/api/class/lookup', { method: 'POST', body: { passcode: typed } }), {}, classMw);
  assert.equal(found.status, 200);
  assert.deepEqual((await body(found)).class, { name: 'Algebra II', period: 'P3', test: false });
  ok(`lookup accepts "${typed}" and rejects a wrong code`);

  const a = aliases[0];
  const wrongPin = a.pin === '000000' ? '111111' : '000000';
  const unknown = await call(signin, 'POST', S('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: 'VectorFoxZZZZ', pin: a.pin } }), {}, classMw);
  const wrong = await call(signin, 'POST', S('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: a.alias, pin: wrongPin } }), {}, classMw);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal((await body(unknown)).error, (await body(wrong)).error);
  ok('unknown alias and wrong PIN give the same answer');

  const good = await call(signin, 'POST', S('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: ` ${a.alias.toLowerCase()} `, pin: a.pin } }), {}, classMw);
  assert.equal(good.status, 200);
  const d = await body(good);
  assert.equal(d.student.alias, a.alias);
  assert.equal(d.student.teacher, 'WALKER');
  studentCookie = cookieOf(good, '__Host-wm_student');
  assert.ok(studentCookie);
  const setc = good.headers.get('Set-Cookie');
  assert.match(setc, /HttpOnly/);
  assert.match(setc, /Secure/);
  ok('alias typed in lowercase with spaces + correct PIN signs in; cookie is HttpOnly + Secure');

  const meRes = await body(await call(sme, 'GET', req('/api/class/me', { cookie: studentCookie }), {}, classMw));
  assert.equal(meRes.student.alias, a.alias);
  const anon = await body(await call(sme, 'GET', req('/api/class/me'), {}, classMw));
  assert.equal(anon.student, null);
  ok('/api/class/me knows the device; anonymous gets null');

  // lockout
  const b = aliases[1];
  const bad = b.pin === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    const r = await call(signin, 'POST', S('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: b.alias, pin: bad } }), {}, classMw);
    assert.equal(r.status, 401);
  }
  const locked = await call(signin, 'POST', S('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: b.alias, pin: b.pin } }), {}, classMw);
  assert.equal(locked.status, 429);
  ok('5 wrong PINs lock the alias, even against the right PIN');

  // teacher gives a new PIN: unlocks, old PIN dead
  const np = await call(pinR, 'POST', T(`/api/teach/classes/${cls.id}/aliases/x/pin`, { method: 'POST', body: {} }), { classId: cls.id, aliasId: (await env.DB.prepare('SELECT id FROM student_aliases WHERE alias = ?1').bind(b.alias).first()).id }, teachMw);
  const fresh = await body(np);
  assert.equal(fresh.alias, b.alias);
  const oldPin = await call(signin, 'POST', S('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: b.alias, pin: b.pin } }), {}, classMw);
  assert.equal(oldPin.status, fresh.pin === b.pin ? 200 : 401);
  const newPin = await call(signin, 'POST', S('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: b.alias, pin: fresh.pin } }), {}, classMw);
  assert.equal(newPin.status, 200);
  ok('new PIN from the teacher clears the lockout; old card stops working');
}

console.log('teacher controls');
{
  const aId = (await env.DB.prepare('SELECT id FROM student_aliases WHERE alias = ?1').bind(aliases[0].alias).first()).id;
  const list = await body(await call(classOne, 'GET', T(`/api/teach/classes/${cls.id}`), { classId: cls.id }, teachMw));
  assert.equal(list.aliases.find((x) => x.id === aId).devices, 1);
  assert.ok(!('pin' in list.aliases[0]) && !('pin_hash' in list.aliases[0]));
  ok('roster shows signed-in device counts and never PINs');

  await call(aliasOne, 'PATCH', T(`/api/teach/classes/${cls.id}/aliases/${aId}`, { method: 'PATCH', body: { retired: true } }), { classId: cls.id, aliasId: aId }, teachMw);
  assert.equal((await body(await call(sme, 'GET', req('/api/class/me', { cookie: studentCookie }), {}, classMw))).student, null);
  const blocked = await call(signin, 'POST', req('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: aliases[0].alias, pin: aliases[0].pin } }), {}, classMw);
  assert.equal(blocked.status, 401);
  await call(aliasOne, 'PATCH', T(`/api/teach/classes/${cls.id}/aliases/${aId}`, { method: 'PATCH', body: { retired: false } }), { classId: cls.id, aliasId: aId }, teachMw);
  ok('retiring an alias signs it out and blocks sign-in; bringing it back works');

  const s2 = await call(signin, 'POST', req('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: aliases[2].alias, pin: aliases[2].pin } }), {}, classMw);
  const c2 = cookieOf(s2, '__Host-wm_student');
  const oldCode = cls.passcode;
  const rot = await body(await call(passcodeR, 'POST', T(`/api/teach/classes/${cls.id}/passcode`, { method: 'POST', body: { signOutAll: false } }), { classId: cls.id }, teachMw));
  assert.notEqual(rot.class.passcode, oldCode);
  assert.ok((await body(await call(sme, 'GET', req('/api/class/me', { cookie: c2 }), {}, classMw))).student);
  assert.equal((await call(lookup, 'POST', req('/api/class/lookup', { method: 'POST', body: { passcode: oldCode } }), {}, classMw)).status, 404);
  ok('new code without sign-out: old code stops working, signed-in devices stay in');

  const rot2 = await body(await call(passcodeR, 'POST', T(`/api/teach/classes/${cls.id}/passcode`, { method: 'POST', body: { signOutAll: true } }), { classId: cls.id }, teachMw));
  cls = rot2.class;
  assert.equal((await body(await call(sme, 'GET', req('/api/class/me', { cookie: c2 }), {}, classMw))).student, null);
  ok('new code with "sign everyone out" ends every device session');

  const s3 = await call(signin, 'POST', req('/api/class/signin', { method: 'POST', body: { passcode: cls.passcode, alias: aliases[3].alias, pin: aliases[3].pin } }), {}, classMw);
  const c3 = cookieOf(s3, '__Host-wm_student');
  await call(classOne, 'PATCH', T(`/api/teach/classes/${cls.id}`, { method: 'PATCH', body: { archived: true } }), { classId: cls.id }, teachMw);
  assert.equal((await body(await call(sme, 'GET', req('/api/class/me', { cookie: c3 }), {}, classMw))).student, null);
  assert.equal((await call(lookup, 'POST', req('/api/class/lookup', { method: 'POST', body: { passcode: cls.passcode } }), {}, classMw)).status, 404);
  await call(classOne, 'PATCH', T(`/api/teach/classes/${cls.id}`, { method: 'PATCH', body: { archived: false } }), { classId: cls.id }, teachMw);
  ok('archiving a class closes it to students; restoring reopens it');

  const lo = await call(slogout, 'POST', req('/api/class/logout', { method: 'POST', body: {}, cookie: c3 }), {}, classMw);
  assert.match(lo.headers.get('Set-Cookie'), /Max-Age=0/);
  ok('student "switch" clears the device cookie');
}

console.log('allowlist and clean-up');
{
  const saved = env.TEACHER_ACCOUNTS;
  env.TEACHER_ACCOUNTS = 'brett@example.com=WALKER:sandbox';
  assert.equal((await call(me, 'GET', T('/api/teach/me'), {}, teachMw)).status, 401);
  assert.equal((await call(lookup, 'POST', req('/api/class/lookup', { method: 'POST', body: { passcode: cls.passcode } }), {}, classMw)).status, 404);
  env.TEACHER_ACCOUNTS = saved;
  ok('removing an email from TEACHER_ACCOUNTS locks out the teacher and closes their classes');

  const before = (await env.DB.prepare('SELECT COUNT(*) n FROM student_aliases').first()).n;
  const del = await call(classOne, 'DELETE', T(`/api/teach/classes/${cls.id}`, { method: 'DELETE' }), { classId: cls.id }, teachMw);
  assert.equal(del.status, 200);
  const after = (await env.DB.prepare('SELECT COUNT(*) n FROM student_aliases').first()).n;
  const sess = (await env.DB.prepare('SELECT COUNT(*) n FROM student_sessions').first()).n;
  assert.equal(before, 30);
  assert.equal(after, 0);
  assert.equal(sess, 0);
  ok('deleting a class removes its aliases and sessions (cascade)');

  const lo = await call(logout, 'POST', T('/api/auth/logout', { method: 'POST', body: {} }));
  assert.match(lo.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await call(me, 'GET', T('/api/teach/me'), {}, teachMw)).status, 401);
  ok('teacher sign-out ends the session');
}

{
  const leaked = env.DB.sql.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  const cols = leaked.flatMap((t) => env.DB.sql.prepare(`PRAGMA table_info(${t})`).all().map((c) => `${t}.${c.name}`));
  assert.ok(!cols.some((c) => /name/.test(c) && /student/.test(c)));
  assert.ok(!cols.some((c) => /\bip\b|user_agent|\.pin$/.test(c)));
  ok('no student name, PIN or IP column exists anywhere');
}

console.log(`\n${passed} checks passed`);
