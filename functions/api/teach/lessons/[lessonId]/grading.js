// functions/api/teach/lessons/[lessonId]/grading.js
//   GET  -> { lesson, runs }   the grading screen: every delivery that has started, with its own copy
//                              of the graded modules (keys included), answers, grades and releases
//   POST { grades: [{ runId, moduleId, aliasId, questionId, score, comment }] } -> { saved, cleared }
//        score: points (capped at the question's worth), or null to clear (back to the automatic
//        mark). Up to 200 at once, so a whole group of the same answer can get credit together.
//   POST { release: { runIds, moduleId, released } } -> { changed }
//        "Release scores" (or take them back) for one module in some deliveries.

import { fail, json, readJson } from '../../../../../src/lib/server/http.ts';
import { cleanGradeInputs, gradingView, saveGrades, setReleased } from '../../../../../src/lib/server/grades.ts';

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;

export async function onRequestGet({ env, data, params }) {
  const view = await gradingView(env.DB, data.teacher.id, params.lessonId);
  if (!view) return fail('Not found.', 404);
  return json(view);
}

export async function onRequestPost({ request, env, data, params }) {
  const body = await readJson(request, 200_000);
  if (!body) return fail('Invalid request.');
  if (body.release) {
    const r = body.release;
    if (!Array.isArray(r.runIds) || !r.runIds.every(isId) || !isId(r.moduleId) || typeof r.released !== 'boolean') return fail('Invalid request.');
    const changed = await setReleased(env.DB, data.teacher.id, params.lessonId, [...new Set(r.runIds)], r.moduleId, r.released);
    return json({ changed });
  }
  const inputs = cleanGradeInputs(body.grades);
  if (typeof inputs === 'string') return fail(inputs);
  const r = await saveGrades(env.DB, data.teacher.id, params.lessonId, inputs);
  if (!r.ok) return fail(r.error, r.status);
  return json({ saved: r.saved, cleared: r.cleared });
}
