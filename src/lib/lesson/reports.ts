// src/lib/lesson/reports.ts
// Reports (Phase 5a): what each delivered lesson can report, and the sheets a report is made of.
// Pure functions with no database or framework imports, like pacing.ts: the API gathers the rows
// (src/lib/server/reports.ts), this module lays them out, and the browser writes the file
// (src/lib/reports/files.ts).
//
// Each module reports whatever it collects, from its answer spec (answers.ts): a module that takes
// answers has Responses, one with keyed questions also has Results, a Coliseum activity has its
// best score. A module that collects nothing is listed but can't be picked. Activities that start
// taking input join in by declaring an answer spec; nothing here lists module types by name.
//
// Rows are student aliases, never names. A blank cell means nothing was handed in.

import { answerSpec, isAnswered, isCorrect, toNumber, type Answers } from './answers.ts';

export type ItemKind = 'joined' | 'responses' | 'results' | 'coliseum' | 'none';

/** A module as the run's snapshot holds it (answer keys included; Notes content left out). */
export interface ReportModule {
  id: string;
  type: string;
  title: string;
  config: any;
}

export interface ReportItem {
  /** `${moduleId}:${kind}`, or 'joined' */
  key: string;
  moduleId: string;
  kind: ItemKind;
  /** The module's title ('' for Joined) */
  module: string;
  /** What the picker's column says: "Bellwork · Results" */
  label: string;
  /** false: the module collects nothing (shown greyed out) */
  available: boolean;
}

export interface ReportQuestion {
  id: string;
  kind: string;
  text: string;
  choices: string[];
  answer: string;
}

const KIND_LABEL: Record<ItemKind, string> = {
  joined: 'Joined',
  responses: 'Responses',
  results: 'Results',
  coliseum: 'Coliseum',
  none: ''
};

export const JOINED: ReportItem = { key: 'joined', moduleId: '', kind: 'joined', module: '', label: 'Joined', available: true };

const isColiseum = (m: ReportModule) => m.type === 'activity' && m.config?.category === 'coliseum' && !!m.config?.coliseumId;

/** A module's questions with their keys ([] when it takes no questions). */
export function moduleQuestions(m: ReportModule): ReportQuestion[] {
  const spec = answerSpec(m);
  if (spec?.kind !== 'questions') return [];
  const keys = new Map<string, any>((m.config?.questions ?? []).map((q: any) => [q.id, q]));
  return spec.questions.map((q) => ({
    id: q.id,
    kind: q.kind,
    text: q.text ?? '',
    choices: q.choices ?? [],
    answer: String(keys.get(q.id)?.answer ?? '')
  }));
}

/** What one delivered lesson can report, in module order, Joined first. */
export function reportItems(modules: ReportModule[]): ReportItem[] {
  const items: ReportItem[] = [JOINED];
  for (const m of modules) {
    const title = m.title || 'Untitled';
    const item = (kind: ItemKind, available = true): ReportItem => ({
      key: `${m.id}:${kind}`,
      moduleId: m.id,
      kind,
      module: title,
      label: kind === 'none' ? title : `${title} · ${KIND_LABEL[kind]}`,
      available
    });
    const spec = answerSpec(m);
    if (spec) {
      items.push(item('responses'));
      if (moduleQuestions(m).some((q) => q.answer !== '')) items.push(item('results'));
    } else if (isColiseum(m)) {
      items.push(item('coliseum'));
    } else {
      items.push(item('none', false));
    }
  }
  return items;
}

/* ---------------- building a report ---------------- */

export interface ReportRun {
  id: string;
  lessonId: string;
  lessonTitle: string;
  classId: string;
  className: string;
  period: string;
  /** 'YYYY-MM-DD' and 'HH:MM' as scheduled */
  date: string;
  startTime: string;
  modules: ReportModule[];
}

export interface ReportData {
  runs: ReportRun[];
  aliases: { id: string; classId: string; alias: string; retired: boolean }[];
  submissions: { runId: string; moduleId: string; aliasId: string; answers: Answers }[];
  scores: { runId: string; moduleId: string; aliasId: string; best: number; plays: number }[];
  joins: { runId: string; aliasId: string; joinedAt: number }[];
}

export type Breakdown = 'aggregate' | 'period' | 'lesson';

export interface ReportRequest {
  runIds: string[];
  /** lessonId -> item keys picked for that lesson */
  items: Record<string, string[]>;
  breakdown: Breakdown;
  /** `${lessonId}:${moduleId}:${questionId}` for the question analysis sheet ([] = no such sheet) */
  questions: string[];
  /** For the Joined times. */
  timeZone: string;
}

export type Cell = string | number | null;

export interface Sheet {
  name: string;
  columns: string[];
  rows: Cell[][];
}

type Student = { id: string; classId: string; alias: string };

/** One report column: a header, and how to read a student's value from their class's run. */
interface Column {
  header: string;
  value: (run: ReportRun, student: Student) => Cell;
}

/** A lesson as one class had it: the nth delivery of that lesson to that class (usually the only one). */
interface Instance {
  key: string;
  lessonId: string;
  title: string;
  /** classId -> that class's run */
  runs: Map<string, ReportRun>;
  columns: Column[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const byAlias = (a: Student, b: Student) => a.alias.toLowerCase().localeCompare(b.alias.toLowerCase());
const runOrder = (a: ReportRun, b: ReportRun) => (a.date + a.startTime).localeCompare(b.date + b.startTime);

/** A choice answer ('1') as its text ('B. x = 3'); other answers as typed. */
export function answerText(q: ReportQuestion, a: string | undefined): string | null {
  if (a === undefined || a.trim() === '') return null;
  if (q.kind === 'choice') {
    const i = Number(a);
    return Number.isInteger(i) && q.choices[i] !== undefined ? `${String.fromCharCode(65 + i)}. ${q.choices[i]}` : a;
  }
  return a.trim();
}

function timeOf(ms: number, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(ms);
  }
}

/** Sheet names: at most 31 characters, none of : \ / ? * [ ], unique (case-insensitive). */
export function sheetName(want: string, taken: Set<string>): string {
  const base = (want.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31);
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  taken.add(name.toLowerCase());
  return name;
}

export function buildReport(data: ReportData, req: ReportRequest): Sheet[] {
  const wanted = new Set(req.runIds);
  const runs = data.runs.filter((r) => wanted.has(r.id)).sort(runOrder);

  // Look-ups
  const subs = new Map<string, Answers>();
  for (const s of data.submissions) subs.set(`${s.runId}|${s.moduleId}|${s.aliasId}`, s.answers);
  const best = new Map<string, number>();
  for (const s of data.scores) best.set(`${s.runId}|${s.moduleId}|${s.aliasId}`, s.best);
  const joined = new Map<string, number>();
  const recorded = new Set<string>();
  for (const j of data.joins) {
    joined.set(`${j.runId}|${j.aliasId}`, j.joinedAt);
    recorded.add(j.runId);
  }
  const touched = new Set<string>(); // aliases with anything in these runs (keeps retired ones that took part)
  for (const k of [...subs.keys(), ...best.keys()]) touched.add(k.split('|')[2]);
  for (const k of joined.keys()) touched.add(k.split('|')[1]);

  // Lesson instances: the nth delivery of a lesson to a class. Usually n = 1.
  const instances: Instance[] = [];
  const nth = new Map<string, number>();
  for (const run of runs) {
    const ck = `${run.lessonId}|${run.classId}`;
    const n = (nth.get(ck) ?? 0) + 1;
    nth.set(ck, n);
    const key = `${run.lessonId}#${n}`;
    let inst = instances.find((i) => i.key === key);
    if (!inst) {
      inst = { key, lessonId: run.lessonId, title: n > 1 ? `${run.lessonTitle} (${n})` : run.lessonTitle, runs: new Map(), columns: [] };
      instances.push(inst);
    }
    inst.runs.set(run.classId, run);
  }

  // Columns per instance, from its latest run's modules (a module's id is stable across edits).
  for (const inst of instances) {
    const latest = [...inst.runs.values()].sort(runOrder).at(-1)!;
    const picked = new Set(req.items[inst.lessonId] ?? []);
    for (const item of reportItems(latest.modules)) {
      if (!item.available || !picked.has(item.key)) continue;
      const head = (detail: string) => `${inst.title} · ${item.module ? `${item.module} · ` : ''}${detail}`;
      const mod = latest.modules.find((m) => m.id === item.moduleId);
      const find = (run: ReportRun) => run.modules.find((m) => m.id === item.moduleId);
      const answersOf = (run: ReportRun, s: Student) => subs.get(`${run.id}|${item.moduleId}|${s.id}`);

      if (item.kind === 'joined') {
        inst.columns.push({
          header: head('Joined'),
          value: (run, s) => {
            if (!recorded.has(run.id)) return 'not recorded';
            const at = joined.get(`${run.id}|${s.id}`);
            return at === undefined ? null : timeOf(at, req.timeZone);
          }
        });
      } else if (item.kind === 'coliseum') {
        inst.columns.push({ header: head('Best score'), value: (run, s) => best.get(`${run.id}|${item.moduleId}|${s.id}`) ?? null });
      } else if (item.kind === 'results') {
        const total = moduleQuestions(mod!).filter((q) => q.answer !== '').length;
        inst.columns.push({
          header: head(`Correct (of ${total})`),
          value: (run, s) => {
            const m = find(run);
            const a = answersOf(run, s);
            const spec = m && answerSpec(m);
            if (!m || !a || !spec || !isAnswered(spec, a)) return null;
            return moduleQuestions(m).filter((q) => q.answer !== '' && isCorrect(q, a[q.id]) === true).length;
          }
        });
      } else if (item.kind === 'responses') {
        const spec = answerSpec(mod!);
        if (spec?.kind === 'questions') {
          moduleQuestions(mod!).forEach((q, i) => {
            inst.columns.push({
              header: head(`Q${i + 1}: ${clip(q.text, 40)}`),
              value: (run, s) => {
                const rq = find(run) ? moduleQuestions(find(run)!).find((x) => x.id === q.id) : undefined;
                const raw = answersOf(run, s)?.[q.id];
                if (!rq) return null;
                if (rq.kind === 'number' && raw !== undefined && raw.trim() !== '') {
                  const n = toNumber(raw);
                  if (Number.isFinite(n)) return n;
                }
                return answerText(rq, raw);
              }
            });
          });
        } else if (spec?.kind === 'short') {
          inst.columns.push({ header: head('Response'), value: (run, s) => answersOf(run, s)?.short?.trim() || null });
        } else if (spec?.kind === 'tap') {
          inst.columns.push({ header: head('Done'), value: (run, s) => (answersOf(run, s)?.done === '1' ? 'done' : null) });
        }
      }
    }
  }

  // Students of the classes these runs went to: everyone current, plus retired aliases that took part.
  const classes = new Map<string, { name: string; period: string }>();
  for (const r of runs) classes.set(r.classId, { name: r.className, period: r.period });
  const students: Student[] = data.aliases
    .filter((a) => classes.has(a.classId) && (!a.retired || touched.has(a.id)))
    .map((a) => ({ id: a.id, classId: a.classId, alias: a.alias }));
  const classOrder = [...classes.keys()].sort((a, b) => {
    const A = classes.get(a)!;
    const B = classes.get(b)!;
    return A.period.localeCompare(B.period) || A.name.localeCompare(B.name);
  });
  const studentsOf = (classIds: string[]) =>
    classIds.flatMap((c) => students.filter((s) => s.classId === c).sort(byAlias));

  const cells = (insts: Instance[], s: Student): Cell[] =>
    insts.flatMap((inst) => {
      const run = inst.runs.get(s.classId);
      return inst.columns.map((c) => (run ? c.value(run, s) : null));
    });
  const headers = (insts: Instance[]) => insts.flatMap((i) => i.columns.map((c) => c.header));
  const withColumns = instances.filter((i) => i.columns.length);

  const taken = new Set<string>();
  const sheets: Sheet[] = [];

  if (withColumns.length) {
    if (req.breakdown === 'period') {
      for (const classId of classOrder) {
        const cls = classes.get(classId)!;
        const insts = withColumns.filter((i) => i.runs.has(classId));
        if (!insts.length) continue;
        sheets.push({
          name: sheetName(`${cls.name} ${cls.period}`, taken),
          columns: ['Alias', ...headers(insts)],
          rows: studentsOf([classId]).map((s) => [s.alias, ...cells(insts, s)])
        });
      }
    } else if (req.breakdown === 'lesson') {
      const lessonIds = [...new Set(withColumns.map((i) => i.lessonId))];
      for (const lessonId of lessonIds) {
        const insts = withColumns.filter((i) => i.lessonId === lessonId);
        const classIds = classOrder.filter((c) => insts.some((i) => i.runs.has(c)));
        sheets.push({
          name: sheetName(insts[0].title.replace(/ \(\d+\)$/, ''), taken),
          columns: ['Class', 'Period', 'Alias', ...headers(insts)],
          rows: studentsOf(classIds).map((s) => [classes.get(s.classId)!.name, classes.get(s.classId)!.period, s.alias, ...cells(insts, s)])
        });
      }
    } else {
      sheets.push({
        name: sheetName('All', taken),
        columns: ['Class', 'Period', 'Alias', ...headers(withColumns)],
        rows: studentsOf(classOrder).map((s) => [classes.get(s.classId)!.name, classes.get(s.classId)!.period, s.alias, ...cells(withColumns, s)])
      });
    }
  }

  const analysis = questionAnalysis(runs, req.questions, subs, classOrder, classes);
  if (analysis) sheets.push({ ...analysis, name: sheetName('Questions', taken) });
  return sheets;
}

/* ---------------- question analysis ---------------- */

const normAnswer = (v: string) => v.trim().replace(/\s+/g, ' ');

/**
 * One row per question: how many answered, how many were right, the most common wrong answers,
 * and percent correct per class. A question edited between deliveries (same id, new text) gets a
 * row of its own.
 */
function questionAnalysis(
  runs: ReportRun[],
  picked: string[],
  subs: Map<string, Answers>,
  classOrder: string[],
  classes: Map<string, { name: string; period: string }>
): Omit<Sheet, 'name'> | null {
  if (!picked.length) return null;
  const want = new Set(picked);
  const byModule = new Map<string, Answers[]>();
  for (const [k, answers] of subs) {
    const [runId, moduleId] = k.split('|');
    const list = byModule.get(`${runId}|${moduleId}`) ?? [];
    list.push(answers);
    byModule.set(`${runId}|${moduleId}`, list);
  }
  type Group = { lesson: string; module: string; q: ReportQuestion; answered: number; correct: number; wrong: Map<string, number>; byClass: Map<string, { answered: number; correct: number }> };
  const groups = new Map<string, Group>();

  for (const run of runs) {
    for (const m of run.modules) {
      for (const q of moduleQuestions(m)) {
        if (!want.has(`${run.lessonId}:${m.id}:${q.id}`)) continue;
        const gk = `${run.lessonId}|${m.id}|${q.id}|${q.text}`;
        let g = groups.get(gk);
        if (!g) {
          g = { lesson: run.lessonTitle, module: m.title, q, answered: 0, correct: 0, wrong: new Map(), byClass: new Map() };
          groups.set(gk, g);
        }
        const per = g.byClass.get(run.classId) ?? { answered: 0, correct: 0 };
        g.byClass.set(run.classId, per);
        for (const answers of byModule.get(`${run.id}|${m.id}`) ?? []) {
          const raw = answers[q.id];
          if (raw === undefined || raw.trim() === '') continue;
          g.answered++;
          per.answered++;
          const ok = isCorrect(q, raw);
          if (ok === true) {
            g.correct++;
            per.correct++;
          } else if (ok === false) {
            const shown = normAnswer(answerText(q, raw) ?? raw);
            g.wrong.set(shown, (g.wrong.get(shown) ?? 0) + 1);
          }
        }
      }
    }
  }
  if (!groups.size) return null;

  const pct = (c: number, n: number) => (n ? Math.round((100 * c) / n) : null);
  const classIds = classOrder.filter((c) => [...groups.values()].some((g) => g.byClass.has(c)));
  return {
    columns: [
      'Lesson', 'Module', 'Question', 'Key', 'Answered', 'Correct', '% correct', 'Most common wrong answers',
      ...classIds.map((c) => `${classes.get(c)!.name} ${classes.get(c)!.period} % correct`)
    ],
    rows: [...groups.values()].map((g) => {
      const keyed = g.q.answer !== '';
      const top = [...g.wrong.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([a, n]) => `${a} (${n})`)
        .join('; ');
      return [
        g.lesson,
        g.module,
        g.q.text,
        keyed ? answerText(g.q, g.q.answer) : '(no key)',
        g.answered,
        keyed ? g.correct : null,
        keyed ? pct(g.correct, g.answered) : null,
        top || null,
        ...classIds.map((c) => {
          const per = g.byClass.get(c);
          return keyed && per ? pct(per.correct, per.answered) : null;
        })
      ];
    })
  };
}
