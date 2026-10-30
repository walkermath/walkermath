// functions/api/class/answers.js
//   GET  ?run=<runId>                              -> { answers: { moduleId: { answers, updatedAt } } }
//   POST { runId, moduleId, answers }              -> { answers, updatedAt }
//        409 { closed: true } once the module has closed (moved on, or its time ran out).
// A student's answers in a live lesson. Who is answering comes from the student's session, never
// from the request; only a live run of the student's own class is reachable (404 otherwise).

import { fail, json, readJson } from '../../../src/lib/server/http.ts';
import { currentStudent } from '../../../src/lib/server/sessions.ts';
import { saveAnswers, studentAnswers, studentRun } from '../../../src/lib/server/submissions.ts';

const MAX_BODY = 40_000; // 20 questions of a few hundred characters each

export async function onRequestGet({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const run = await studentRun(env.DB, s, new URL(request.url).searchParams.get('run'));
  if (!run) return fail('Not found.', 404);
  return json({ answers: await studentAnswers(env.DB, run.id, s.aliasId) });
}

export async function onRequestPost({ request, env }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const body = await readJson(request, MAX_BODY);
  if (!body) return fail('Invalid request.');
  const run = await studentRun(env.DB, s, body.runId);
  if (!run) return fail('Not found.', 404);
  const r = await saveAnswers(env, s, run, body.moduleId, body.answers);
  if (!r.ok) return fail(r.error, r.status, r.closed ? { closed: true } : {});
  return json({ answers: r.answers, updatedAt: r.updatedAt });
}
