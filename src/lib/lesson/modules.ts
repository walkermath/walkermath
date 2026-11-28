// src/lib/lesson/modules.ts
// Lesson and module shapes, defaults and validation, shared by the builder (browser) and the
// Pages Functions. Every module type is one entry in MODULE_TYPES; adding a type later means one
// entry here plus its editor (Phase 3) and student/monitor views (Phase 4).
//
// Answer keys live only in a module's private part. splitModule() separates them before storage
// and publicModule() is the only shape that will ever be sent to students.

import { cleanLine, cleanText, isUuid, newUuid } from './clean.ts';
import { cleanQuestions, KEYLESS_KINDS, newQuestion as registryNewQuestion, type Question, type QuestionKind } from '../questions/index.ts';
import { splitSlides } from './slides.ts';
import { STEP_SEC } from './time.ts';
import { cleanChecklist } from './checklist.ts';
import { cleanTerms } from './terms.ts';
import type { GlossaryEntry } from '../glossary.ts';

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

export type { Question, QuestionKind } from '../questions/index.ts';
export { cleanLine, cleanText, isUuid } from './clean.ts';

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
  { id: 'feedback', label: 'Active Feedback', title: 'Active feedback' },
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
  /**
   * Active Feedback only: questions students answer while the teacher marks each answer by hand
   * (no answer key: every `answer` is ''). Absent on other categories.
   */
  questions?: Question[];
}

/** Question kinds an Active Feedback activity can ask (grids and card sorts need a key to be useful). */
export const FEEDBACK_QUESTION_KINDS: readonly QuestionKind[] = KEYLESS_KINDS;

/** An Active Feedback activity: questions with no key, marked live by the teacher. */
export const isFeedbackActivity = (m: { type: string; config: any }): boolean =>
  m.type === 'activity' && m.config?.category === 'feedback';

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
  /** The readiness checklist students tick off when they join this lesson (up to 5 short items, may be empty). */
  checklist: string[];
  /** The lesson's own tooltips (a word and its definition), layered over the site glossary. */
  terms: GlossaryEntry[];
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
    collects: (c) => (c as ActivityConfig).category === 'feedback'
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
    if (category === 'feedback') toFeedback(m);
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

/**
 * Makes an activity an Active Feedback one: it collects its questions' answers (no "done" tap), and
 * by default holds when time runs out so the teacher can finish giving feedback before moving on.
 */
export function toFeedback(m: { onTimeUp: OnTimeUp; config: any }) {
  m.config.category = 'feedback';
  if (!Array.isArray(m.config.questions)) m.config.questions = [];
  m.config.doneTap = false;
  m.onTimeUp = 'hold';
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

/** A new, empty question of a kind (the question registry decides its starting fields). */
export const newQuestion = (kind: QuestionKind = 'text'): Question => registryNewQuestion(kind);

export const DEFAULT_LESSON_SEC = 50 * 60;

/* ---------------- validation ---------------- */



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
      const questions = cleanQuestions(c.questions, where, false, LIMITS.questions);
      if (typeof questions === 'string') return questions;
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
      const category: ActivityCategory = isActivityCategory(c.category) ? c.category : 'other';
      const out: ActivityConfig = {
        category,
        instructions: cleanText(c.instructions, LIMITS.text),
        links,
        doneTap: c.doneTap !== false,
        coliseumId: typeof c.coliseumId === 'string' && COLISEUM_ID.test(c.coliseumId) ? c.coliseumId : ''
      };
      if (category === 'feedback') {
        // Answering the questions is the hand-in, so there's no "done" tap.
        const questions = cleanQuestions(c.questions, where, true, LIMITS.questions);
        if (typeof questions === 'string') return questions;
        out.questions = questions;
        out.doneTap = false;
      }
      return out;
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
    checklist: cleanChecklist(b?.checklist),
    terms: cleanTerms(b?.terms),
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

/** Every question in a config, whatever the module type: the split never trusts the type, so a key can't slip out. */
const allQuestions = (config: any): Question[] => (Array.isArray(config?.questions) ? config.questions : []);

export interface StoredModule {
  config: ModuleConfig;
  /** Answer keys (and other accepted answers) by question id, and the teacher's notes. Never sent to students. */
  private: { answers?: Record<string, string>; alts?: Record<string, string[]>; rubrics?: Record<string, string>; notes?: string };
}

export function splitModule(m: LessonModule): StoredModule {
  const priv: StoredModule['private'] = {};
  if (m.teacherNotes) priv.notes = m.teacherNotes;
  // Any module with questions: every key goes to the private part, so a key can never be stored
  // in the public config, whatever kind of module the questions are in.
  if (!allQuestions(m.config).length) return { config: m.config, private: priv };
  const answers: Record<string, string> = {};
  const alts: Record<string, string[]> = {};
  const rubrics: Record<string, string> = {};
  const questions = allQuestions(m.config).map((q) => {
    if (q.answer) answers[q.id] = q.answer;
    if (q.alts?.length) alts[q.id] = q.alts;
    if (q.rubric) rubrics[q.id] = q.rubric;
    const { alts: _x, rubric: _y, ...rest } = q;
    return { ...rest, answer: '' };
  });
  if (Object.keys(answers).length) priv.answers = answers;
  if (Object.keys(alts).length) priv.alts = alts;
  if (Object.keys(rubrics).length) priv.rubrics = rubrics;
  return { config: { ...(m.config as any), questions }, private: priv };
}

/** Puts the private keys back into a module's questions (notes are read separately). */
export function joinModule(config: ModuleConfig, priv: StoredModule['private'], _type?: ModuleType): ModuleConfig {
  if ((!priv?.answers && !priv?.alts && !priv?.rubrics) || !allQuestions(config).length) return config;
  return {
    ...(config as any),
    questions: allQuestions(config).map((q) => ({
      ...q,
      answer: priv.answers?.[q.id] ?? '',
      ...(priv.alts?.[q.id]?.length ? { alts: priv.alts[q.id] } : {}),
      ...(priv.rubrics?.[q.id] ? { rubric: priv.rubrics[q.id] } : {})
    }))
  };
}

/** The only module shape that will be sent to students: no answer keys, no private notes. */
export function publicModule(m: LessonModule) {
  const { config } = splitModule(m);
  // Questions lose their key field altogether, so nothing key-shaped leaves.
  const strip = (c: ModuleConfig) =>
    allQuestions(c).length ? { ...(c as any), questions: allQuestions(c).map(({ answer: _a, alts: _b, rubric: _c, ...q }) => q) } : c;
  return { id: m.id, type: m.type, title: m.title, collects: MODULE_TYPES[m.type].collects(m.config), config: strip(config) };
}
