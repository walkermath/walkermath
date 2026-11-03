// functions/api/class/lessons/[runId].js
//   GET -> { lesson: { run, resources, modules, ink, answers, marks, scores } }
// One finished lesson of the student's own class: its pages and ink, and only this student's own
// answers, marks and scores (404 for anything else). Answer keys and private notes are never sent.

import { fail, json } from '../../../../src/lib/server/http.ts';
import { currentStudent } from '../../../../src/lib/server/sessions.ts';
import { pastLesson } from '../../../../src/lib/server/studentLessons.ts';

export async function onRequestGet({ request, env, params }) {
  const s = await currentStudent(env, request);
  if (!s) return fail('Sign in to your class first.', 401);
  const lesson = await pastLesson(env.DB, s, params.runId);
  if (!lesson) return fail('Not found.', 404);
  return json({ lesson });
}
