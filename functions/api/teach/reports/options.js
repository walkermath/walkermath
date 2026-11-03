// functions/api/teach/reports/options.js
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -> { lessons }
// The report picker: this teacher's finished deliveries in the date range, grouped by lesson, with
// what each lesson can report and its questions (src/lib/server/reports.ts).

import { fail, json } from '../../../../src/lib/server/http.ts';
import { REPORT_LIMITS, isIsoDate, reportOptions } from '../../../../src/lib/server/reports.ts';

export async function onRequestGet({ request, env, data }) {
  const q = new URL(request.url).searchParams;
  const from = q.get('from');
  const to = q.get('to');
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return fail('Pick a start and end date.');
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > REPORT_LIMITS.days) return fail('Pick a range of a year or less.');
  return json({ lessons: await reportOptions(env.DB, data.teacher.id, from, to) });
}
