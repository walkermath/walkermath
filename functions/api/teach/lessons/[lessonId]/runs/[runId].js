// functions/api/teach/lessons/[lessonId]/runs/[runId].js
//   PATCH { classId, date, startTime, endTime } -> { run, runs }   (scheduled runs only)
//   DELETE                                      -> { runs }        (scheduled runs only)

import { fail, json, readJson } from '../../../../../../src/lib/server/http.ts';
import { cleanRunInput, getLesson, lessonRuns, ownedRun, updateRun } from '../../../../../../src/lib/server/lessons.ts';

async function load(env, data, params) {
  const lesson = await getLesson(env.DB, data.teacher.id, params.lessonId);
  const run = lesson && (await ownedRun(env.DB, lesson.id, params.runId));
  return { lesson, run };
}

export async function onRequestPatch({ request, env, data, params }) {
  const { lesson, run } = await load(env, data, params);
  if (!run) return fail('Not found.', 404);
  if (run.status !== 'scheduled') return fail("This delivery has already started, so it can't be moved.");
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');
  const input = await cleanRunInput(env.DB, data.teacher.id, body, data.teacher.timeZone, run.id);
  if (typeof input === 'string') return fail(input);
  await updateRun(env.DB, run.id, input);
  return json({ run: await ownedRun(env.DB, lesson.id, run.id), runs: await lessonRuns(env.DB, lesson.id) });
}

export async function onRequestDelete({ env, data, params }) {
  const { lesson, run } = await load(env, data, params);
  if (!run) return fail('Not found.', 404);
  if (run.status !== 'scheduled') return fail("This delivery has already started, so it's kept with the lesson's records.");
  await env.DB.prepare("DELETE FROM lesson_runs WHERE id = ?1 AND status = 'scheduled'").bind(run.id).run();
  return json({ runs: await lessonRuns(env.DB, lesson.id) });
}
