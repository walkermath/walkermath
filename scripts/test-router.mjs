// The /api route table (src/worker/router.ts): every handler file is routed, params and folder
// middleware work as they did under Pages. Run: npm run test:router
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const { ROUTES, MIDDLEWARE, match, route } = await import('../src/worker/router.ts');

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test('every file in functions/ is routed (or is folder middleware)', () => {
  const files = walk('functions').filter((f) => f.endsWith('.js')).sort();
  const routed = new Set([...ROUTES.map((r) => r.file), ...MIDDLEWARE.map((m) => m.file)]);
  assert.deepEqual(files.filter((f) => !routed.has(f)), []);
  assert.equal(new Set(ROUTES.map((r) => r.path)).size, ROUTES.length, 'no path twice');
  for (const r of ROUTES) assert.ok(Object.keys(r.mod).some((k) => k.startsWith('onRequest')), `${r.file} has handlers`);
});

test('paths and [params] match as Pages did', () => {
  assert.equal(match('/api/teach/classes').route.file, 'functions/api/teach/classes/index.js');
  assert.equal(match('/api/teach/classes/').route.file, 'functions/api/teach/classes/index.js', 'trailing slash');
  const pin = match('/api/teach/classes/c1/aliases/a%2D2/pin');
  assert.equal(pin.route.file, 'functions/api/teach/classes/[classId]/aliases/[aliasId]/pin.js');
  assert.deepEqual(pin.params, { classId: 'c1', aliasId: 'a-2' });
  assert.deepEqual(match('/api/live/run-9').params, { runId: 'run-9' });
  assert.equal(match('/api/teach/runs/r1/answers').route.file, 'functions/api/teach/runs/[runId]/answers.js');
  assert.equal(match('/api/teach/classes/c1/nope'), null);
  assert.equal(match('/api/teach/classes/a/b/c/d/e/f'), null);
  assert.equal(match('/api/live/%E0%A4%A'), null, 'a malformed escape is no match');
});

const ctx = { waitUntil() {} };
const env = { DB: null };
const call = (path, init) => route(new Request(`http://localhost:8787${path}`, init), env, ctx);

test('unknown paths are 404, unknown methods 405 with Allow', async () => {
  assert.equal((await call('/api/nope')).status, 404);
  const res = await call('/api/auth/google/start', { method: 'DELETE' });
  assert.equal(res.status, 405);
  assert.match(res.headers.get('Allow'), /GET/);
});

test('folder middleware runs first: /api/teach and /api/class writes need this site as Origin', async () => {
  // Both middlewares refuse a cross-site write before the handler (or the database) is reached.
  const evil = { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' };
  assert.equal((await call('/api/teach/classes', evil)).status, 403);
  assert.equal((await call('/api/class/signin', evil)).status, 403);
});
