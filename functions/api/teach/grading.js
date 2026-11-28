// functions/api/teach/grading.js
//   GET -> { lessons }   the to-grade list: ended deliveries with long answers to grade or grades
//                        to release, grouped by lesson (see toGradeList in src/lib/server/grades.ts)

import { json } from '../../../src/lib/server/http.ts';
import { toGradeList } from '../../../src/lib/server/grades.ts';

export async function onRequestGet({ env, data }) {
  return json({ lessons: await toGradeList(env.DB, data.teacher.id) });
}
