// functions/api/teach/lessons/[lessonId]/index.js
//   GET                                       -> { lesson, runs }
//   PUT { baseUpdatedAt, title, objective, successCriteria, durationSec, modules } -> { lesson }
//        Saves the whole lesson. 409 if it was saved somewhere else since baseUpdatedAt.
//   PATCH { archived }                        -> { lesson }
//   DELETE                                    -> { ok }   (refused once a run has started: archive instead)

import { fail, json, readJson } from '../../../../../src/lib/server/http.ts';
import { cleanLessonFields, cleanModules } from '../../../../../src/lib/lesson/modules.ts';
import {
  foreignModuleIds,
  getLesson,
  hasStartedRuns,
  lessonRuns,
  saveLesson,
  setLessonArchived
} from '../../../../../src/lib/server/lessons.ts';

const MAX_BODY = 300_000;

export async function onRequestGet({ env, data, params }) {
  const lesson = await getLesson(env.DB, data.teacher.id, params.lessonId);
  if (!lesson) return fail('Not found.', 404);
  return json({ lesson, runs: await lessonRuns(env.DB, lesson.id) });
}

export async function onRequestPut({ request, env, data, params }) {
  const lesson = await getLesson(env.DB, data.teacher.id, params.lessonId);
  if (!lesson) return fail('Not found.', 404);
  const body = await readJson(request, MAX_BODY);
  if (!body) return fail('That lesson is too big to save, or the request was invalid.');

  if (Number(body.baseUpdatedAt) !== lesson.updatedAt) {
    return fail('This lesson was changed in another tab or device. Reload to get the latest version.', 409);
  }
  const fields = cleanLessonFields(body);
  if (typeof fields === 'string') return fail(fields);
  const modules = cleanModules(body.modules);
  if (typeof modules === 'string') return fail(modules);
  if (await foreignModuleIds(env.DB, lesson.id, modules.map((m) => m.id))) return fail('Module ids clash. Reload and try again.');

  await saveLesson(env.DB, lesson, fields, modules);
  return json({ lesson: await getLesson(env.DB, data.teacher.id, lesson.id) });
}

export async function onRequestPatch({ request, env, data, params }) {
  const lesson = await getLesson(env.DB, data.teacher.id, params.lessonId);
  if (!lesson) return fail('Not found.', 404);
  const body = await readJson(request);
  if (!body || typeof body.archived !== 'boolean') return fail('Invalid request.');
  await setLessonArchived(env.DB, lesson.id, body.archived);
  return json({ lesson: await getLesson(env.DB, data.teacher.id, lesson.id) });
}

export async function onRequestDelete({ env, data, params }) {
  const lesson = await getLesson(env.DB, data.teacher.id, params.lessonId);
  if (!lesson) return fail('Not found.', 404);
  if (await hasStartedRuns(env.DB, lesson.id)) {
    return fail('This lesson has been taught, so its records are kept. Archive it instead.');
  }
  await env.DB.prepare('DELETE FROM lessons WHERE id = ?1').bind(lesson.id).run();
  return json({ ok: true });
}
