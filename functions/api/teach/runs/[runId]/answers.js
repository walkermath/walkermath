// functions/api/teach/runs/[runId]/answers.js
//   GET -> { modules, rows, scores }   what a delivery has collected so far, marked against its keys
//        modules: the modules that collect something (questions, short answer, done taps, Coliseum)
//        rows:    one per student per module: { moduleId, aliasId, alias, answers, correct, updatedAt }
//        scores:  Coliseum results per student per module: { moduleId, aliasId, alias, best, plays }
//        feedback: your marks and messages in Active Feedback activities:
//                 { moduleId, aliasId, questionId, mark, message, answer, at }

import { fail, json } from '../../../../../src/lib/server/http.ts';
import { getLiveRun } from '../../../../../src/lib/server/live.ts';
import { runFeedback } from '../../../../../src/lib/server/feedback.ts';
import { runAnswers } from '../../../../../src/lib/server/submissions.ts';

export async function onRequestGet({ env, data, params }) {
  const run = await getLiveRun(env.DB, params.runId);
  if (!run || run.teacherId !== data.teacher.id) return fail('Not found.', 404);
  const [collected, feedback] = await Promise.all([runAnswers(env.DB, run), runFeedback(env.DB, run.id)]);
  return json({ ...collected, feedback });
}
