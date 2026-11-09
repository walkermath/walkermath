// src/lib/server/reports.ts
// Reports (Phase 5a): reads what a report needs from D1, for one teacher. The layout itself is
// src/lib/lesson/reports.ts; the browser writes the file. Nothing is saved: a report is built on
// request and handed back.
//
// Only finished deliveries are reported. Each run's modules come from its own snapshot (the
// lesson as it was taught), read without the Notes slides so a term of lessons stays small.

import { reportItems, moduleQuestions, sortByRank, type ReportData, type ReportItem, type ReportModule, type ReportRun } from '../lesson/reports.ts';

export const REPORT_LIMITS = { runs: 300, days: 400, questions: 500 } as const;

const parse = (s: unknown, fallback: any) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
};

/** Modules from a snapshot, with only what reports read (keys included, slides left out). */
const MODULES_SQL = `(SELECT json_group_array(json_object(
    'id', json_extract(m.value, '$.id'),
    'type', json_extract(m.value, '$.type'),
    'title', json_extract(m.value, '$.title'),
    'questions', json_extract(m.value, '$.config.questions'),
    'response', json_extract(m.value, '$.config.response'),
    'doneTap', json_extract(m.value, '$.config.doneTap'),
    'category', json_extract(m.value, '$.config.category'),
    'coliseumId', json_extract(m.value, '$.config.coliseumId')))
  FROM json_each(r.snapshot_json, '$.modules') m)`;

function toModules(json: unknown): ReportModule[] {
  const list = parse(json, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((m: any) => m && typeof m.id === 'string')
    .map((m: any) => ({
      id: m.id,
      type: String(m.type ?? ''),
      title: String(m.title ?? ''),
      config: {
        ...(Array.isArray(m.questions) ? { questions: m.questions } : {}),
        ...(m.response ? { response: m.response } : {}),
        ...(m.doneTap ? { doneTap: true } : {}),
        ...(m.category ? { category: m.category } : {}),
        ...(m.coliseumId ? { coliseumId: m.coliseumId } : {})
      }
    }));
}

const RUNS_SQL = `SELECT r.id, r.lesson_id, r.class_id, r.run_date, r.start_time, l.title AS lesson_title,
       c.name AS class_name, c.period, ${MODULES_SQL} AS modules_json
  FROM lesson_runs r
  JOIN lessons l ON l.id = r.lesson_id
  JOIN classes c ON c.id = r.class_id
 WHERE l.teacher_id = ?1 AND r.status = 'ended'`;

const toRun = (r: any): ReportRun => ({
  id: r.id,
  lessonId: r.lesson_id,
  lessonTitle: r.lesson_title,
  classId: r.class_id,
  className: r.class_name,
  period: r.period,
  date: r.run_date,
  startTime: r.start_time,
  modules: toModules(r.modules_json)
});

export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export interface ReportLesson {
  lessonId: string;
  title: string;
  runs: { runId: string; classId: string; className: string; period: string; date: string; startTime: string }[];
  /** What the lesson can report (the union across its deliveries; the latest titles win). */
  items: ReportItem[];
  /** Questions for the analysis tree, by module. */
  modules: { moduleId: string; title: string; questions: { id: string; text: string; keyed: boolean }[] }[];
}

/** The picker: this teacher's finished deliveries between two dates, grouped by lesson. */
export async function reportOptions(db: any, teacherId: string, from: string, to: string): Promise<ReportLesson[]> {
  const { results } = await db
    .prepare(`${RUNS_SQL} AND r.run_date BETWEEN ?2 AND ?3 ORDER BY r.run_date, r.start_time LIMIT ${REPORT_LIMITS.runs}`)
    .bind(teacherId, from, to)
    .all();
  const lessons = new Map<string, ReportLesson & { seen: Map<string, ReportItem>; mods: Map<string, ReportLesson['modules'][number]> }>();
  for (const run of (results as any[]).map(toRun)) {
    let l = lessons.get(run.lessonId);
    if (!l) {
      l = { lessonId: run.lessonId, title: run.lessonTitle, runs: [], items: [], modules: [], seen: new Map(), mods: new Map() };
      lessons.set(run.lessonId, l);
    }
    l.runs.push({ runId: run.id, classId: run.classId, className: run.className, period: run.period, date: run.date, startTime: run.startTime });
    // Runs are in date order, so later deliveries overwrite titles and add anything new.
    for (const item of reportItems(run.modules)) l.seen.set(item.key, item);
    for (const m of run.modules) {
      const qs = moduleQuestions(m);
      if (qs.length) l.mods.set(m.id, { moduleId: m.id, title: m.title, questions: qs.map((q) => ({ id: q.id, text: q.text, keyed: q.answer !== '' })) });
    }
  }
  return [...lessons.values()].map(({ seen, mods, ...l }) => ({ ...l, items: sortByRank([...seen.values()]), modules: [...mods.values()] }));
}

/** Everything buildReport needs for these runs, or null if any isn't this teacher's finished delivery. */
export async function reportData(db: any, teacherId: string, runIds: string[]): Promise<ReportData | null> {
  const ids = JSON.stringify(runIds);
  const IN = 'IN (SELECT value FROM json_each(?2))';
  const { results: runRows } = await db.prepare(`${RUNS_SQL} AND r.id ${IN}`).bind(teacherId, ids).all();
  if (runRows.length !== new Set(runIds).size) return null;
  const runs = (runRows as any[]).map(toRun);
  const classIds = JSON.stringify([...new Set(runs.map((r) => r.classId))]);

  const [aliases, subs, scores, joins, feedback] = await Promise.all([
    db.prepare('SELECT id, class_id, alias, retired FROM student_aliases WHERE class_id IN (SELECT value FROM json_each(?1))').bind(classIds).all(),
    db.prepare(`SELECT run_id, module_id, alias_id, answers_json FROM submissions WHERE run_id IN (SELECT value FROM json_each(?1))`).bind(ids).all(),
    db
      .prepare(
        `SELECT run_id, module_id, alias_id, MAX(score) AS best, COUNT(*) AS plays FROM lesson_scores
          WHERE run_id IN (SELECT value FROM json_each(?1)) AND module_id IS NOT NULL
          GROUP BY run_id, module_id, alias_id`
      )
      .bind(ids)
      .all(),
    readJoins(db, ids),
    readFeedback(db, ids)
  ]);

  return {
    runs,
    aliases: aliases.results.map((a: any) => ({ id: a.id, classId: a.class_id, alias: a.alias, retired: !!a.retired })),
    submissions: subs.results.map((s: any) => ({ runId: s.run_id, moduleId: s.module_id, aliasId: s.alias_id, answers: parse(s.answers_json, {}) })),
    scores: scores.results.map((s: any) => ({ runId: s.run_id, moduleId: s.module_id, aliasId: s.alias_id, best: Number(s.best), plays: Number(s.plays) })),
    joins,
    feedback
  };
}

/** The teacher's Active Feedback marks (not the messages); none before migration 0012 is run. */
async function readFeedback(db: any, ids: string): Promise<NonNullable<ReportData['feedback']>> {
  try {
    const { results } = await db
      .prepare(`SELECT run_id, module_id, alias_id, question_id, mark FROM feedback WHERE mark IS NOT NULL AND run_id IN (SELECT value FROM json_each(?1))`)
      .bind(ids)
      .all();
    return results.map((f: any) => ({ runId: f.run_id, moduleId: f.module_id, aliasId: f.alias_id, questionId: f.question_id, mark: f.mark }));
  } catch {
    return [];
  }
}

/** Join times; none at all before migration 0009 is run (the report then says "not recorded"). */
async function readJoins(db: any, ids: string): Promise<ReportData['joins']> {
  try {
    const { results } = await db.prepare('SELECT run_id, alias_id, joined_at FROM run_joins WHERE run_id IN (SELECT value FROM json_each(?1))').bind(ids).all();
    return results.map((j: any) => ({ runId: j.run_id, aliasId: j.alias_id, joinedAt: Number(j.joined_at) }));
  } catch {
    return [];
  }
}
