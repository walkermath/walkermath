// functions/api/live/[runId].js
// The way into a live lesson's room, for its teacher and the students of its class.
//
//   GET with "Upgrade: websocket" -> the room's WebSocket (lesson, state, roster messages)
//   GET [?full=1]                 -> { state, serverNow, lesson?, students? }   polling fallback
//   POST { cmd }                  -> { state, serverNow }   teacher only (next, back, adjust...)
//
// Who is connecting is checked here, from the session cookie, and passed to the room as
// headers. Only those headers are forwarded: the room never sees cookies, IPs or anything else.

import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { getLiveRun, roomHeaders, roomRole, roomStub } from '../../../src/lib/server/live.ts';
import { currentStudent, currentTeacher } from '../../../src/lib/server/sessions.ts';

const sameSite = (request) => {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
};

async function who(env, request, runId) {
  const run = await getLiveRun(env.DB, runId);
  if (!run) return null;
  const [teacher, student] = await Promise.all([currentTeacher(env, request), currentStudent(env, request)]);
  const role = roomRole(run, teacher, student);
  return role ? { run, role, headers: roomHeaders(role, teacher, student) } : null;
}

export async function onRequestGet({ request, env, params }) {
  if (!env.LESSON_ROOM) return fail('The live room is not available.', 503);
  // A WebSocket from another site would carry this site's cookies: refuse it.
  if (!sameSite(request)) return fail('Bad origin.', 403);
  const w = await who(env, request, params.runId);
  if (!w) return fail('Not found.', 404);
  if (w.run.status === 'scheduled') return fail("This lesson hasn't started yet.", 409);

  const room = roomStub(env, w.run.id);
  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    return room.fetch('https://room.internal/socket', { headers: { Upgrade: 'websocket', ...w.headers } });
  }
  const full = new URL(request.url).searchParams.get('full') === '1' ? '?full=1' : '';
  const res = await room.fetch(`https://room.internal/state${full}`, { headers: w.headers });
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export async function onRequestPost({ request, env, params }) {
  if (!env.LESSON_ROOM) return fail('The live room is not available.', 503);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return fail('Bad origin.', 403);
  const w = await who(env, request, params.runId);
  if (!w || w.role !== 'teacher') return fail('Not found.', 404);
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const res = await roomStub(env, w.run.id).fetch('https://room.internal/cmd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...w.headers },
    body: JSON.stringify({ cmd: body.cmd })
  });
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
