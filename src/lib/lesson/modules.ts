// src/lib/lesson/modules.ts
// Lesson and module shapes, defaults and validation, shared by the builder (browser) and the
// Pages Functions. Every module type is one entry in MODULE_TYPES; adding a type later means one
// entry here plus its editor (Phase 3) and student/monitor views (Phase 4).
//
// Answer keys live only in a module's private part. splitModule() separates them before storage
// and publicModule() is the only shape that will ever be sent to students.

import { STEP_SEC } from './time.ts';

/* ---------------- limits ---------------- */

export const LIMITS = {
  lessonTitle: 100,
  objective: 500,
  successCriteria: 1000,
  minLessonSec: 5 * 60,
  maxLessonSec: 4 * 60 * 60,
  modules: 20,
  moduleTitle: 80,
  minModuleSec: STEP_SEC,
  maxModuleSec: 2 * 60 * 60,
  text: 2000,
  markdown: 20000,
  links: 10,
  linkLabel: 80,
  url: 500,
  questions: 20,
  choices: 6,
  choice: 200,
  answer: 200
} as const;

/* ---------------- types ---------------- */

export type ModuleType = 'prompt' | 'notes' | 'activity' | 'independent';
export type Pacing = 'flex' | 'locked';
export type OnTimeUp = 'auto' | 'hold';

export interface Link {
  label: string;
  url: string;
}

export type QuestionKind = 'text' | 'number' | 'choice';

export interface Question {
  id: string;
  kind: QuestionKind;
  text: string;
  /** Multiple choice only. */
  choices: string[];
  /** Optional answer key: text, a number as text, or the correct choice's index as text. Private. */
  answer: string;
}

export interface PromptConfig {
  questions: Question[];
}

export interface NotesConfig {
  source: 'note' | 'markdown';
  /** A published note's id from /notes (source 'note'). */
  noteId: string;
  /** Markdown with $...$ KaTeX (source 'markdown'). */
  markdown: string;
  /** Teacher reveals the note's sections one at a time during the lesson. */
  revealSections: boolean;
}

export interface ActivityConfig {
  instructions: string;
  links: Link[];
  /** Students can tap "done". */
  doneTap: boolean;
}

export interface IndependentConfig {
  instructions: string;
  links: Link[];
  response: 'none' | 'done' | 'short';
}

export type ModuleConfig = PromptConfig | NotesConfig | ActivityConfig | IndependentConfig;

/** A module as the builder edits it (answer keys included). */
export interface LessonModule {
  id: string;
  type: ModuleType;
  title: string;
  plannedSec: number;
  pacing: Pacing;
  /** Floor when the schedule squeezes this module; null = half its plan. */
  minSec: number | null;
  onTimeUp: OnTimeUp;
  config: ModuleConfig;
}

export interface LessonFields {
  title: string;
  objective: string;
  successCriteria: string;
  durationSec: number;
}

export interface ModuleTypeInfo {
  label: string;
  /** Shown under the tile and in the student header as "// <hint>". */
  hint: string;
  defaultTitle: string;
  defaultSec: number;
  defaultConfig: () => ModuleConfig;
  /** Whether students hand something in (drives auto-collect and the sidebar tick/cross). */
  collects: (config: ModuleConfig) => boolean;
}

export const MODULE_TYPES: Record<ModuleType, ModuleTypeInfo> = {
  prompt: {
    label: 'Prompt',
    hint: 'questions: bellwork, check-in, exit ticket',
    defaultTitle: 'Bellwork',
    defaultSec: 5 * 60,
    defaultConfig: (): PromptConfig => ({ questions: [] }),
    collects: () => true
  },
  notes: {
    label: 'Notes',
    hint: 'a page from /notes, or your own Markdown',
    defaultTitle: 'Notes',
    defaultSec: 10 * 60,
    defaultConfig: (): NotesConfig => ({ source: 'note', noteId: '', markdown: '', revealSections: false }),
    collects: () => false
  },
  activity: {
    label: 'Activity',
    hint: 'instructions and links',
    defaultTitle: 'Learning activity',
    defaultSec: 7 * 60,
    defaultConfig: (): ActivityConfig => ({ instructions: '', links: [], doneTap: true }),
    collects: () => false
  },
  independent: {
    label: 'Independent work',
    hint: 'practice, with an optional short answer',
    defaultTitle: 'Independent work',
    defaultSec: 15 * 60,
    defaultConfig: (): IndependentConfig => ({ instructions: '', links: [], response: 'done' }),
    collects: (c) => (c as IndependentConfig).response === 'short'
  }
};

export const MODULE_TYPE_LIST = Object.keys(MODULE_TYPES) as ModuleType[];
export const isModuleType = (v: unknown): v is ModuleType => typeof v === 'string' && v in MODULE_TYPES;

const newUuid = () => crypto.randomUUID();

export function newModule(type: ModuleType): LessonModule {
  const t = MODULE_TYPES[type];
  return {
    id: newUuid(),
    type,
    title: t.defaultTitle,
    plannedSec: t.defaultSec,
    pacing: 'flex',
    minSec: null,
    onTimeUp: 'auto',
    config: t.defaultConfig()
  };
}

export const newQuestion = (kind: QuestionKind = 'text'): Question => ({
  id: newUuid(),
  kind,
  text: '',
  choices: kind === 'choice' ? ['', ''] : [],
  answer: ''
});

export const DEFAULT_LESSON_SEC = 50 * 60;

/* ---------------- validation ---------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Single line: control characters removed, whitespace collapsed, trimmed, cut to `max`. */
export function cleanLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Multi-line text: keeps newlines and tabs, drops other control characters, trims the ends. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
}

const isStep = (n: unknown): n is number => Number.isInteger(n) && (n as number) % STEP_SEC === 0;

export function cleanUrl(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.length > LIMITS.url) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

function cleanLinks(v: unknown): Link[] | string {
  if (!Array.isArray(v)) return [];
  if (v.length > LIMITS.links) return `At most ${LIMITS.links} links per module.`;
  const out: Link[] = [];
  for (const l of v) {
    const url = cleanUrl(l?.url);
    if (!url) {
      if (!String(l?.url ?? '').trim() && !String(l?.label ?? '').trim()) continue; // empty row
      return `"${String(l?.url ?? '').slice(0, 60)}" isn't a web link (it should start with https://).`;
    }
    out.push({ url, label: cleanLine(l?.label, LIMITS.linkLabel) || new URL(url).hostname });
  }
  return out;
}

export const NOTE_ID = /^[a-z0-9][a-z0-9/_-]{0,119}$/i;

function cleanConfig(type: ModuleType, c: any, where: string): ModuleConfig | string {
  c = c && typeof c === 'object' ? c : {};
  switch (type) {
    case 'prompt': {
      const qs = Array.isArray(c.questions) ? c.questions : [];
      if (qs.length > LIMITS.questions) return `${where}: at most ${LIMITS.questions} questions.`;
      const questions: Question[] = [];
      for (const [i, q] of qs.entries()) {
        const kind: QuestionKind = ['text', 'number', 'choice'].includes(q?.kind) ? q.kind : 'text';
        const text = cleanText(q?.text, LIMITS.text);
        if (!text) return `${where}: question ${i + 1} is empty.`;
        let choices: string[] = [];
        let answer = cleanLine(q?.answer, LIMITS.answer);
        if (kind === 'choice') {
          choices = (Array.isArray(q?.choices) ? q.choices : []).map((x: unknown) => cleanLine(x, LIMITS.choice)).filter(Boolean);
          if (choices.length < 2 || choices.length > LIMITS.choices) {
            return `${where}: question ${i + 1} needs 2 to ${LIMITS.choices} choices.`;
          }
          if (answer && !(Number.isInteger(Number(answer)) && Number(answer) >= 0 && Number(answer) < choices.length)) answer = '';
        }
        if (kind === 'number' && answer && !Number.isFinite(Number(answer))) {
          return `${where}: the answer to question ${i + 1} should be a number.`;
        }
        questions.push({ id: isUuid(q?.id) ? q.id : newUuid(), kind, text, choices, answer });
      }
      return { questions };
    }
    case 'notes': {
      const source = c.source === 'markdown' ? 'markdown' : 'note';
      const noteId = source === 'note' && typeof c.noteId === 'string' && NOTE_ID.test(c.noteId) ? c.noteId : '';
      return {
        source,
        noteId,
        markdown: cleanText(c.markdown, LIMITS.markdown),
        revealSections: c.revealSections === true
      };
    }
    case 'activity': {
      const links = cleanLinks(c.links);
      if (typeof links === 'string') return `${where}: ${links}`;
      return { instructions: cleanText(c.instructions, LIMITS.text), links, doneTap: c.doneTap !== false };
    }
    case 'independent': {
      const links = cleanLinks(c.links);
      if (typeof links === 'string') return `${where}: ${links}`;
      const response = ['none', 'done', 'short'].includes(c.response) ? c.response : 'done';
      return { instructions: cleanText(c.instructions, LIMITS.text), links, response };
    }
  }
}

export function cleanModule(m: any, index: number): LessonModule | string {
  const where = `Module ${index + 1}`;
  if (!m || typeof m !== 'object') return `${where} is missing.`;
  if (!isModuleType(m.type)) return `${where} has an unknown type.`;
  if (!isUuid(m.id)) return `${where} has a bad id.`;
  const title = cleanLine(m.title, LIMITS.moduleTitle);
  if (!title) return `${where} needs a title.`;
  const plannedSec = Number(m.plannedSec);
  if (!isStep(plannedSec) || plannedSec < LIMITS.minModuleSec || plannedSec > LIMITS.maxModuleSec) {
    return `${where}: time must be between 0:15 and 2:00:00, in 15-second steps.`;
  }
  const pacing: Pacing = m.pacing === 'locked' ? 'locked' : 'flex';
  let minSec: number | null = null;
  if (m.minSec !== null && m.minSec !== undefined && m.minSec !== '') {
    minSec = Number(m.minSec);
    if (!isStep(minSec) || minSec < STEP_SEC || minSec > plannedSec) {
      return `${where}: the shortest time must be at most its planned time, in 15-second steps.`;
    }
  }
  const onTimeUp: OnTimeUp = m.onTimeUp === 'hold' ? 'hold' : 'auto';
  const config = cleanConfig(m.type, m.config, `${where} (${title})`);
  if (typeof config === 'string') return config;
  return { id: m.id, type: m.type, title, plannedSec, pacing, minSec: pacing === 'flex' ? minSec : null, onTimeUp, config };
}

export function cleanLessonFields(b: any): LessonFields | string {
  const title = cleanLine(b?.title, LIMITS.lessonTitle);
  if (!title) return 'Give the lesson a title.';
  const durationSec = Number(b?.durationSec);
  if (!Number.isInteger(durationSec) || durationSec % 60 !== 0 || durationSec < LIMITS.minLessonSec || durationSec > LIMITS.maxLessonSec) {
    return 'Duration must be whole minutes, between 5 and 240.';
  }
  return {
    title,
    objective: cleanText(b?.objective, LIMITS.objective),
    successCriteria: cleanText(b?.successCriteria, LIMITS.successCriteria),
    durationSec
  };
}

export function cleanModules(list: unknown): LessonModule[] | string {
  if (!Array.isArray(list)) return 'Modules are missing.';
  if (list.length > LIMITS.modules) return `At most ${LIMITS.modules} modules per lesson.`;
  const out: LessonModule[] = [];
  const ids = new Set<string>();
  for (const [i, m] of list.entries()) {
    const clean = cleanModule(m, i);
    if (typeof clean === 'string') return clean;
    if (ids.has(clean.id)) return `Module ${i + 1} has a duplicate id.`;
    ids.add(clean.id);
    out.push(clean);
  }
  return out;
}

/* ---------------- public / private split ---------------- */

export interface StoredModule {
  config: ModuleConfig;
  /** Answer keys by question id. Never sent to students. */
  private: { answers?: Record<string, string> };
}

export function splitModule(m: LessonModule): StoredModule {
  if (m.type !== 'prompt') return { config: m.config, private: {} };
  const answers: Record<string, string> = {};
  const questions = (m.config as PromptConfig).questions.map((q) => {
    if (q.answer) answers[q.id] = q.answer;
    return { ...q, answer: '' };
  });
  return { config: { questions }, private: Object.keys(answers).length ? { answers } : {} };
}

export function joinModule(config: ModuleConfig, priv: StoredModule['private'], type: ModuleType): ModuleConfig {
  if (type !== 'prompt' || !priv?.answers) return config;
  return {
    questions: (config as PromptConfig).questions.map((q) => ({ ...q, answer: priv.answers?.[q.id] ?? '' }))
  };
}

/** The only module shape that will be sent to students: no answer keys, no private notes. */
export function publicModule(m: LessonModule) {
  const { config } = splitModule(m);
  const strip = (c: ModuleConfig) =>
    m.type === 'prompt'
      ? { questions: (c as PromptConfig).questions.map(({ answer: _a, ...q }) => q) }
      : c;
  return { id: m.id, type: m.type, title: m.title, collects: MODULE_TYPES[m.type].collects(m.config), config: strip(config) };
}
