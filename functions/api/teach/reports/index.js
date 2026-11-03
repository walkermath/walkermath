// functions/api/teach/reports/index.js
//   POST { runIds, items: { lessonId: [itemKey] }, breakdown, questions } -> { sheets }
// Builds a report (src/lib/lesson/reports.ts) from this teacher's finished deliveries. The
// browser turns the sheets into a .xlsx or .csv file; nothing is saved here.

import { buildReport } from '../../../../src/lib/lesson/reports.ts';
import { fail, json, readJson } from '../../../../src/lib/server/http.ts';
import { REPORT_LIMITS, reportData } from '../../../../src/lib/server/reports.ts';

const BREAKDOWNS = new Set(['aggregate', 'period', 'lesson']);
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;

export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request, 200_000);
  if (!body) return fail('Invalid request.');
  const { runIds, items, breakdown, questions = [] } = body;
  if (!Array.isArray(runIds) || !runIds.length || runIds.length > REPORT_LIMITS.runs || !runIds.every(isId)) {
    return fail('Pick at least one delivery.');
  }
  if (!items || typeof items !== 'object' || Array.isArray(items)) return fail('Invalid request.');
  const cleanItems = {};
  for (const [lessonId, keys] of Object.entries(items)) {
    if (!isId(lessonId) || !Array.isArray(keys) || keys.length > 200 || !keys.every(isId)) return fail('Invalid request.');
    cleanItems[lessonId] = keys;
  }
  if (!BREAKDOWNS.has(breakdown)) return fail('Invalid request.');
  if (!Array.isArray(questions) || questions.length > REPORT_LIMITS.questions || !questions.every(isId)) return fail('Invalid request.');

  const rows = await reportData(env.DB, data.teacher.id, runIds);
  if (!rows) return fail('Not found.', 404);
  const sheets = buildReport(rows, { runIds, items: cleanItems, breakdown, questions, timeZone: data.teacher.timeZone || 'UTC' });
  if (!sheets.length) return fail('Nothing to report: pick at least one item or question.');
  return json({ sheets });
}
