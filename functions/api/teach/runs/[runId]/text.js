// functions/api/teach/runs/[runId]/text.js
//   GET  -> { modules: [{ id, title, slides: [{ id, markdown }] }] }   the Notes pages as taught
//   POST { edits: [{ moduleId, slideId, markdown }], alsoLesson } -> { ok, changed, lessonFixed, lessonSkipped }
//   Corrects typos in a finished delivery's own copy of the notes (what "past lessons" shows students).

import { fail, json, readJson } from '../../../../../src/lib/server/http.ts';
import { getLiveRun } from '../../../../../src/lib/server/live.ts';
import { runText, saveRunText } from '../../../../../src/lib/server/runText.ts';

async function mine(env, data, params) {
  const run = await getLiveRun(env.DB, params.runId);
  return run && run.teacherId === data.teacher.id ? run : null;
}

export async function onRequestGet({ env, data, params }) {
  const run = await mine(env, data, params);
  if (!run) return fail('Not found.', 404);
  const modules = await runText(env.DB, run);
  if (!modules) return fail('This delivery has no saved copy of the lesson.', 409);
  return json({ modules, status: run.status });
}

export async function onRequestPost({ env, data, params, request }) {
  const run = await mine(env, data, params);
  if (!run) return fail('Not found.', 404);
  const body = await readJson(request, 400_000);
  if (!body) return fail('Bad request.', 400);
  const r = await saveRunText(env.DB, run, body.edits, body.alsoLesson === true);
  if (!r.ok) return fail(r.error, r.status);
  return json({ ok: true, changed: r.changed, lessonFixed: r.lessonFixed, lessonSkipped: r.lessonSkipped });
}
