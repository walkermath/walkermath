// functions/api/teach/lessons/[lessonId]/runs/index.js
//   POST { classId, date: 'YYYY-MM-DD', startTime: 'HH:MM', endTime: 'HH:MM' } -> { run, runs }
// Times are wall-clock in the teacher's time zone (saved from their browser).

import { fail, json, readJson } from '../../../../../../src/lib/server/http.ts';
import {
  MAX_UPCOMING_RUNS_PER_LESSON,
  cleanRunInput,
  countUpcomingRuns,
  getLesson,
  insertRun,
  lessonRuns,
  ownedRun
} from '../../../../../../src/lib/server/lessons.ts';

export async function onRequestPost({ request, env, data, params }) {
  const lesson = await getLesson(env.DB, data.teacher.id, params.lessonId);
  if (!lesson) return fail('Not found.', 404);
  if (lesson.archived) return fail('Restore this lesson before scheduling it.');
  const body = await readJson(request);
  if (!body) return fail('Invalid request.');

  if ((await countUpcomingRuns(env.DB, lesson.id)) >= MAX_UPCOMING_RUNS_PER_LESSON) {
    return fail(`At most ${MAX_UPCOMING_RUNS_PER_LESSON} upcoming deliveries per lesson.`);
  }
  const input = await cleanRunInput(env.DB, data.teacher.id, body, data.teacher.timeZone, null);
  if (typeof input === 'string') return fail(input);

  const id = await insertRun(env.DB, lesson.id, input);
  return json({ run: await ownedRun(env.DB, lesson.id, id), runs: await lessonRuns(env.DB, lesson.id) }, 201);
}
