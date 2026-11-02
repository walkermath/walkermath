// src/lib/lesson/modules.ts
// Lesson and module shapes, defaults and validation, shared by the builder (browser) and the
// Pages Functions. Every module type is one entry in MODULE_TYPES; adding a type later means one
// entry here plus its editor (Phase 3) and student/monitor views (Phase 4).
//
// Answer keys live only in a module's private part. splitModule() separates them before storage
// and publicModule() is the only shape that will ever be sent to students.

import { splitSlides } from './slides.ts';
import { STEP_SEC } from './time.ts';

/* ---------------- limits ---------------- */

export const LIMITS = {
  lessonTitle: 100,
  topic: 100,
  standards: 200,
  resources: 10,
  notes: 2000,
  objective: 500,
  successCriteria: 1000,
  minLessonSec: 5 * 60,
  maxLessonSec: 4 * 60 * 60,
  modules: 20,
  moduleTitle: 80,
  minModuleSec: STEP_SEC,
  maxModuleSec: 2 * 60 * 60,
  text: 2000,
  /** All of a Notes module's slides together (a long walkerMath note is about 20k). */
  markdown: 60000,
  slides: 40,
  slide: 8000,
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

/** What a question set is for. Picking one gives the module its starting title (and, for the two
 *  bookends, the usual locked length). */
export const PROMPT_CATEGORIES = [
  { id: 'bellwork', label: 'Bellwork', title: 'Bellwork', sec: 5 * 60, locked: true, pin: 'first' },
  { id: 'check-in', label: 'Check-in', title: 'Check-in', sec: 3 * 60, locked: false, pin: null },
  { id: 'exit-ticket', label: 'Exit ticket', title: 'Exit ticket', sec: 4 * 60, locked: true, pin: 'last' },
  { id: 'other', label: 'Other', title: 'Questions', sec: 5 * 60, locked: false, pin: null }
] as const;
/** Categories a question set in the middle of a lesson can have (bellwork and exit ticket are pinned). */
export const MIDDLE_PROMPT_CATEGORIES = PROMPT_CATEGORIES.filter((c) => c.pin === null);
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number]['id'];
export const isPromptCategory = (v: unknown): v is PromptCategory => PROMPT_CATEGORIES.some((c) => c.id === v);
export const promptCategory = (id: unknown) =>
  PROMPT_CATEGORIES.find((c) => c.id === id) ?? PROMPT_CATEGORIES[PROMPT_CATEGORIES.length - 1];

export interface PromptConfig {
  category: PromptCategory;
  questions: Question[];
}

/**
 * One pre-written slide. Only Markdown for now (with $...$ math and the HTML walkerMath notes use);
 * `kind` leaves room for slides imported later from Google Slides or a .pptx (images).
 */
export interface Slide {
  id: string;
  kind: 'markdown';
  markdown: string;
}

/**
 * A Notes module is an ordered list of pages. A page with Markdown shows it (a pre-written slide); a
 * page with none is a blank blackboard. Either way the teacher can write on it live, and can add a
 * blank board after the current page. Students keep every page, including ones the teacher skipped.
 * A new module is one blank board. Always at least one page.
 */
export interface NotesConfig {
  slides: Slide[];
}

/** What kind of activity this is. Picking one also gives the module its starting title. */
export const ACTIVITY_CATEGORIES = [
  { id: 'turn-talk', label: 'Turn & Talk', title: 'Turn & Talk' },
  { id: 'coliseum', label: 'Coliseum Practice', title: 'Coliseum practice' },
  { id: 'external', label: 'External Tool', title: 'External tool' },
  { id: 'handout', label: 'Paper Handout', title: 'Paper handout' },
  { id: 'other', label: 'Other', title: 'Learning activity' }
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]['id'];
export const isActivityCategory = (v: unknown): v is ActivityCategory =>
  ACTIVITY_CATEGORIES.some((c) => c.id === v);
export const activityCategory = (id: unknown) =>
  ACTIVITY_CATEGORIES.find((c) => c.id === id) ?? ACTIVITY_CATEGORIES[ACTIVITY_CATEGORIES.length - 1];

export interface ActivityConfig {
  category: ActivityCategory;
  instructions: string;
  links: Link[];
  /** Students can tap "done". */
  doneTap: boolean;
  /** Coliseum Practice only: the challenge shown in the module (an id from /coliseum), or ''. */
  coliseumId: string;
}

/** A Coliseum challenge id (its file name under src/content/coliseum). */
export const COLISEUM_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;

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
  /** Teacher-only reminders for this module. Stored privately; never sent to students. */
  teacherNotes: string;
}

export interface LessonFields {
  title: string;
  /** The subject being taught, e.g. "Solving two-step equations". */
  topic: string;
  objective: string;
  successCriteria: string;
  /** Optional standards, e.g. "A.5A, A.5B". */
  standards: string;
  /** Links students can open from the lesson's "Resources" panel. */
  resources: Link[];
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
    defaultTitle: 'Questions',
    defaultSec: 5 * 60,
    defaultConfig: (): PromptConfig => ({ category: 'other', questions: [] }),
    collects: () => true
  },
  notes: {
    label: 'Notes',
    hint: 'a blackboard you write on live, or pre-written slides',
    defaultTitle: 'Notes',
    defaultSec: 10 * 60,
    defaultConfig: (): NotesConfig => ({ slides: [newSlide()] }),
    collects: () => false
  },
  activity: {
    label: 'Activity',
    hint: 'instructions and links',
    defaultTitle: 'Learning activity',
    defaultSec: 7 * 60,
    defaultConfig: (): ActivityConfig => ({ category: 'other', instructions: '', links: [], doneTap: true, coliseumId: '' }),
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

export function newModule(type: ModuleType, category?: ActivityCategory | PromptCategory): LessonModule {
  const t = MODULE_TYPES[type];
  const m: LessonModule = {
    id: newUuid(),
    type,
    title: t.defaultTitle,
    plannedSec: t.defaultSec,
    pacing: 'flex',
    minSec: null,
    onTimeUp: 'auto',
    config: t.defaultConfig(),
    teacherNotes: ''
  };
  if (type === 'activity' && category && isActivityCategory(category)) {
    (m.config as ActivityConfig).category = category;
    m.title = activityCategory(category).title;
  }
  if (type === 'prompt' && category && isPromptCategory(category)) {
    const c = promptCategory(category);
    (m.config as PromptConfig).category = c.id;
    m.title = c.title;
    m.plannedSec = c.sec;
    m.pacing = c.locked ? 'locked' : 'flex';
  }
  return m;
}

/** Every new lesson starts with a locked 5-minute Bellwork and a locked 4-minute Exit ticket. */
export function starterModules(): LessonModule[] {
  return [newModule('prompt', 'bellwork'), newModule('prompt', 'exit-ticket')];
}

/**
 * Where a new module goes: just before the final module when that one is locked (the exit ticket
 * stays last), otherwise at the end. A lone locked module doesn't count: nothing goes before it.
 */
/* ---------------- order: bellwork first, exit ticket last ---------------- */

type Placed = { type: ModuleType; config: any };

/** 'first' for a bellwork, 'last' for an exit ticket, null for everything else. */
export function pinOf(m: Placed): 'first' | 'last' | null {
  if (m.type !== 'prompt') return null;
  return m.config?.category === 'bellwork' ? 'first' : m.config?.category === 'exit-ticket' ? 'last' : null;
}

/** Positions the unpinned modules may occupy: [lo, hi) (between a bellwork and an exit ticket). */
export function freeRange(modules: Placed[]): { lo: number; hi: number } {
  const n = modules.length;
  const lo = n > 0 && pinOf(modules[0]) === 'first' ? 1 : 0;
  const hi = n > lo && pinOf(modules[n - 1]) === 'last' ? n - 1 : n;
  return { lo, hi };
}

/** Where a new module goes: after everything else, before the exit ticket. */
export function insertIndex(modules: Placed[]): number {
  return freeRange(modules).hi;
}

/** Whether the module at `from` may move to `to` (pinned modules never move; nothing passes them). */
export function canMove(modules: Placed[], from: number, to: number): boolean {
  if (from === to || pinOf(modules[from]) !== null) return false;
  const { lo, hi } = freeRange(modules);
  return to >= lo && to < hi;
}

/**
 * Puts the first bellwork at the front and the first exit ticket at the end, keeping everything
 * else in order. Any extra bellwork or exit ticket becomes a plain question set ('other').
 * Used on every save and every load, so older lessons are fixed when they're opened.
 */
export function normalizeOrder<T extends Placed>(modules: T[]): T[] {
  let first: T | null = null;
  let last: T | null = null;
  const middle: T[] = [];
  for (const m of modules) {
    const pin = pinOf(m);
    if (pin === 'first' && !first) first = m;
    else if (pin === 'last' && !last) last = m;
    else {
      if (pin) m.config.category = 'other';
      middle.push(m);
    }
  }
  return [...(first ? [first] : []), ...middle, ...(last ? [last] : [])];
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

export const newSlide = (markdown = ''): Slide => ({ id: newUuid(), kind: 'markdown', markdown });

/**
 * Older Notes configs, brought to { slides }:
 *  - { source, noteId, markdown, revealSections } (before slides): the Markdown becomes slides; a
 *    linked /notes page becomes one slide linking to it.
 *  - { mode, slides } (when Notes had a freeform/pre-written choice): the mode is dropped.
 * Never returns fewer than one page: an empty module is a single blank blackboard.
 */
export function upgradeNotesConfig(c: any): { slides: any[] } {
  let slides: any[] = [];
  if (c && typeof c === 'object') {
    if (Array.isArray(c.slides)) slides = c.slides;
    else if (c.source === 'markdown' && typeof c.markdown === 'string' && c.markdown.trim()) {
      slides = splitSlides(c.markdown).map((md) => newSlide(md));
    } else if (typeof c.noteId === 'string' && NOTE_ID.test(c.noteId)) {
      slides = [newSlide(`[open the ${c.noteId} note](/notes/${c.noteId})`)];
    }
  }
  return { slides: slides.length ? slides : [newSlide()] };
}

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
      return { category: isPromptCategory(c.category) ? c.category : 'other', questions };
    }
    case 'notes': {
      c = upgradeNotesConfig(c);
      const raw = Array.isArray(c.slides) ? c.slides : [];
      if (raw.length > LIMITS.slides) return `${where}: at most ${LIMITS.slides} slides.`;
      const slides: Slide[] = [];
      let total = 0;
      for (const [i, sl] of raw.entries()) {
        const text = typeof sl?.markdown === 'string' ? sl.markdown : '';
        if (text.length > LIMITS.slide) return `${where}: slide ${i + 1} is too long. Split it with a line of ---.`;
        const markdown = cleanText(text, LIMITS.slide);
        total += markdown.length;
        slides.push({ id: isUuid(sl?.id) ? sl.id : newUuid(), kind: 'markdown', markdown });
      }
      if (total > LIMITS.markdown) return `${where}: the slides are too long altogether. Move some into another Notes module.`;
      return { slides: slides.length ? slides : [newSlide()] };
    }
    case 'activity': {
      const links = cleanLinks(c.links);
      if (typeof links === 'string') return `${where}: ${links}`;
      return {
        category: isActivityCategory(c.category) ? c.category : 'other',
        instructions: cleanText(c.instructions, LIMITS.text),
        links,
        doneTap: c.doneTap !== false,
        coliseumId: typeof c.coliseumId === 'string' && COLISEUM_ID.test(c.coliseumId) ? c.coliseumId : ''
      };
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
  const teacherNotes = cleanText(m.teacherNotes, LIMITS.notes);
  return { id: m.id, type: m.type, title, plannedSec, pacing, minSec: pacing === 'flex' ? minSec : null, onTimeUp, config, teacherNotes };
}

export function cleanLessonFields(b: any): LessonFields | string {
  const title = cleanLine(b?.title, LIMITS.lessonTitle);
  if (!title) return 'Give the lesson a title.';
  const durationSec = Number(b?.durationSec);
  if (!Number.isInteger(durationSec) || durationSec % 60 !== 0 || durationSec < LIMITS.minLessonSec || durationSec > LIMITS.maxLessonSec) {
    return 'Duration must be whole minutes, between 5 and 240.';
  }
  const rawResources = Array.isArray(b?.resources) ? b.resources : [];
  if (rawResources.length > LIMITS.resources) return `At most ${LIMITS.resources} resources per lesson.`;
  const resources = cleanLinks(rawResources);
  if (typeof resources === 'string') return resources.replace('per module', 'per lesson');
  return {
    title,
    topic: cleanLine(b?.topic, LIMITS.topic),
    objective: cleanText(b?.objective, LIMITS.objective),
    successCriteria: cleanText(b?.successCriteria, LIMITS.successCriteria),
    standards: cleanLine(b?.standards, LIMITS.standards),
    resources,
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
  return normalizeOrder(out);
}

/* ---------------- public / private split ---------------- */

export interface StoredModule {
  config: ModuleConfig;
  /** Answer keys by question id, and the teacher's notes. Never sent to students. */
  private: { answers?: Record<string, string>; notes?: string };
}

export function splitModule(m: LessonModule): StoredModule {
  const priv: StoredModule['private'] = {};
  if (m.teacherNotes) priv.notes = m.teacherNotes;
  if (m.type !== 'prompt') return { config: m.config, private: priv };
  const answers: Record<string, string> = {};
  const questions = (m.config as PromptConfig).questions.map((q) => {
    if (q.answer) answers[q.id] = q.answer;
    return { ...q, answer: '' };
  });
  if (Object.keys(answers).length) priv.answers = answers;
  return { config: { category: (m.config as PromptConfig).category, questions }, private: priv };
}

/** Puts the private answer keys back into a prompt's config (notes are read separately). */
export function joinModule(config: ModuleConfig, priv: StoredModule['private'], type: ModuleType): ModuleConfig {
  if (type !== 'prompt' || !priv?.answers) return config;
  return {
    ...(config as PromptConfig),
    questions: (config as PromptConfig).questions.map((q) => ({ ...q, answer: priv.answers?.[q.id] ?? '' }))
  };
}

/** The only module shape that will be sent to students: no answer keys, no private notes. */
export function publicModule(m: LessonModule) {
  const { config } = splitModule(m);
  const strip = (c: ModuleConfig) =>
    m.type === 'prompt'
      ? { category: (c as PromptConfig).category, questions: (c as PromptConfig).questions.map(({ answer: _a, ...q }) => q) }
      : c;
  return { id: m.id, type: m.type, title: m.title, collects: MODULE_TYPES[m.type].collects(m.config), config: strip(config) };
}
