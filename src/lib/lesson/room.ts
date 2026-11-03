// src/lib/lesson/room.ts
// The live lesson's state machine: pure functions, no I/O. The LessonRoom Durable Object
// (src/worker/LessonRoom.ts) stores the state and calls apply() for every teacher command and every alarm;
// the control panel and the student view use the clock helpers to draw countdowns.
//
// The room stores timestamps, never a ticking counter. Every module has its own clock: it is
// given `plan[i]` seconds and has used `spent[i]` of them. The current module's clock has been
// running since `moduleStartedAt`; devices compute the time left themselves from `serverNow`, so
// nothing is broadcast once a second.
//
// Leaving a module part-way keeps its time left for when you come back. A module whose time ran
// out (`done`) stays at 0:00: coming back to it waits for the teacher instead of moving on again.
//
// The bell doesn't move (`endsAt`), so every change re-plans the unfinished modules with
// replan(): overruns and early finishes are absorbed by the flex modules.

import { floorOf, replan, type Pacing } from './pacing.ts';
import { STEP_SEC } from './time.ts';

/** A module as the room knows it: timing plus the student-safe config (no answer keys, no notes). */
export interface RoomModule {
  id: string;
  type: 'prompt' | 'notes' | 'activity' | 'independent';
  title: string;
  plannedSec: number;
  pacing: Pacing;
  minSec: number | null;
  onTimeUp: 'auto' | 'hold';
  collects: boolean;
  config: any;
}

/** Everything that changes during the lesson. Small: sent to every device on every change. */
export interface RoomState {
  runId: string;
  version: number;
  status: 'live' | 'ended';
  /** The current module. */
  index: number;
  /** Seconds each module is given (re-planned for flex modules that haven't finished). */
  plan: number[];
  /** Seconds of its clock each module has used (never more than its plan), not counting the current stretch. */
  spent: number[];
  /** Seconds each module was actually on screen, for records (time spent holding at 0:00 included). */
  took: number[];
  /** The module's time ran out: its clock stays at 0:00. */
  done: boolean[];
  /** The Notes page each module was left on. */
  pages: number[];
  /** When each module's clock last stopped (null while it runs or if it never has): answers are
   *  still taken for a few seconds after, so the last thing a student typed isn't lost. */
  closedAt: (number | null)[];
  /** When the current module's clock last started (or, while holding, when it started holding). */
  moduleStartedAt: number;
  /** Set while paused; the clock is frozen at this moment. */
  pausedAt: number | null;
  /** The current module's time is up and it waits for the teacher (onTimeUp 'hold', or the last module). */
  holding: boolean;
  /** The bell (epoch ms). */
  endsAt: number;
  startedAt: number;
  endedAt: number | null;
  /** The page the teacher shows (an index into pagesOf()): a Notes page, or the open board of another module. */
  page: number;
  /**
   * Each module's pages, by id, when they differ from the lesson's (a blackboard was added during the
   * delivery); null = as written: a Notes module's slides, no pages for the other modules.
   */
  pageOrder: (string[] | null)[];
  /** The current module (not Notes) has its board up instead of its own content. */
  onBoard: boolean;
  /** On the projector over the page: a poll's results or one student's answer (never a name). Cleared on moving on. */
  spotlight?: Spotlight | null;
  /** From the latest re-plan: how far the floors run past the bell, and time nothing can absorb. */
  overSec: number;
  spareSec: number;
}

/** What the teacher can put on the projector from the answers box. */
export type Spotlight =
  | { kind: 'tally'; title: string; bars: { label: string; count: number }[] }
  | { kind: 'answer'; title: string; text: string; math: boolean };

export const SPOTLIGHT_LIMITS = { title: 120, label: 80, bars: 12, text: 1000, count: 1000 } as const;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').slice(0, max) : '');

/** A spotlight from the control panel, checked (null = clear it); undefined if it isn't one. */
export function parseSpotlight(v: any): Spotlight | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const title = str(v.title, SPOTLIGHT_LIMITS.title);
  if (v.kind === 'tally' && Array.isArray(v.bars) && v.bars.length >= 1 && v.bars.length <= SPOTLIGHT_LIMITS.bars) {
    const bars = v.bars.map((b: any) => ({ label: str(b?.label, SPOTLIGHT_LIMITS.label), count: Number(b?.count) }));
    if (!bars.every((b: any) => Number.isInteger(b.count) && b.count >= 0 && b.count <= SPOTLIGHT_LIMITS.count)) return undefined;
    return { kind: 'tally', title, bars };
  }
  if (v.kind === 'answer' && typeof v.text === 'string' && v.text.trim()) {
    return { kind: 'answer', title, text: str(v.text, SPOTLIGHT_LIMITS.text), math: v.math === true };
  }
  return undefined;
}

export type Command =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'jump'; index: number }
  | { type: 'adjust'; seconds: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'page'; page: number }
  | { type: 'addBoard'; id: string }
  | { type: 'board'; on: boolean }
  | { type: 'spotlight'; spot: Spotlight | null }
  | { type: 'end' };

/** Pages a module can have (40 slides plus the blackboards added in class). */
export const MAX_PAGES = 80;
/** A blackboard added in class: 'b-' and a random tail, made by the presenting device. */
export const BOARD_ID = /^b-[A-Za-z0-9_-]{6,32}$/;

/** A page of a module as everyone draws it: a pre-written slide, or a blank blackboard (markdown ''). */
export interface Page {
  id: string;
  markdown: string;
  /** Added during this delivery (not in the lesson). */
  added: boolean;
}

/** Module `i`'s pages right now: the lesson's slides (Notes) plus any blackboards added in class. */
export function pagesOf(s: RoomState | null, modules: RoomModule[], i: number): Page[] {
  const m = modules[i];
  if (!m) return [];
  const slides: { id: string; markdown: string }[] = m.type === 'notes' && Array.isArray(m.config?.slides) ? m.config.slides : [];
  const order = s?.pageOrder?.[i];
  if (!order) return slides.map((p) => ({ id: p.id, markdown: p.markdown ?? '', added: false }));
  const byId = new Map(slides.map((p) => [p.id, p]));
  return order.map((id) => {
    const sl = byId.get(id);
    return sl ? { id, markdown: sl.markdown ?? '', added: false } : { id, markdown: '', added: true };
  });
}

/**
 * The page the class should be looking at, or null: the current Notes page, or the board another
 * module has up. (Students in another module, or on another page, get a small live view of it.)
 */
export function livePage(s: RoomState | null, modules: RoomModule[]): Page | null {
  if (!s || s.status !== 'live') return null;
  const m = modules[s.index];
  if (!m || (m.type !== 'notes' && !s.onBoard)) return null;
  return pagesOf(s, modules, s.index)[s.page] ?? null;
}

const sec = (ms: number) => Math.round(ms / 1000);
const step = (s: number) => Math.max(STEP_SEC, Math.round(s / STEP_SEC) * STEP_SEC);

/* ---------------- the clock ---------------- */

/** Rooms started by an older version: fill in the fields they lack, keeping what they have. */
export function upgradeState(s: RoomState): RoomState {
  const n = s.plan.length;
  const old: Partial<RoomState> = s;
  if (old.spent && old.took && old.done && old.pages && old.closedAt && old.pageOrder && typeof old.onBoard === 'boolean') return s;
  const before = (i: number) => i < s.index;
  return {
    ...s,
    spent: old.spent ?? Array.from({ length: n }, (_, i) => (before(i) ? s.plan[i] : 0)),
    took: old.took ?? Array.from({ length: n }, (_, i) => (before(i) ? s.plan[i] : 0)),
    done: old.done ?? Array.from({ length: n }, (_, i) => before(i)),
    pages: old.pages ?? Array.from({ length: n }, () => 0),
    closedAt: old.closedAt ?? Array.from({ length: n }, () => null)
  };
}

/** How long after a module's clock stops its answers are still taken. */
export const ANSWER_GRACE_MS = 8000;

/**
 * Can students change their answers to module `i` at `now`? While it is the current module and its
 * time hasn't run out (a pause doesn't close it), plus a short grace after it closes so the last
 * few keystrokes land. Coming back to a module with time left reopens it.
 */
export function answersOpen(s: RoomState, i: number, now: number): boolean {
  if (s.status !== 'live') return false;
  if (i === s.index && !s.holding) return true;
  const c = s.closedAt?.[i];
  return c != null && now - c <= ANSWER_GRACE_MS;
}

/** Seconds of module `i`'s clock still to run, for a module that isn't the current one. */
export const leftSec = (s: RoomState, i: number) => (s.done[i] ? 0 : Math.max(0, (s.plan[i] ?? 0) - (s.spent[i] ?? 0)));

/** When the current module's clock reaches 0:00 (epoch ms), not counting a pause. */
export function moduleEndsAt(s: RoomState): number {
  if (s.holding) return s.moduleStartedAt;
  return s.moduleStartedAt + ((s.plan[s.index] ?? 0) - (s.spent[s.index] ?? 0)) * 1000;
}

/** Milliseconds left in the current module at `now` (0 while it waits at 0:00). */
export function moduleLeftMs(s: RoomState, now: number): number {
  if (s.holding) return 0;
  return moduleEndsAt(s) - (s.pausedAt ?? now);
}

/** How long the current module has waited at 0:00 for the teacher. */
export const holdingMs = (s: RoomState, now: number) => (s.holding ? Math.max(0, now - s.moduleStartedAt) : 0);

/** Milliseconds until the bell at `now`. */
export const lessonLeftMs = (s: RoomState, now: number) => s.endsAt - now;

/** When the current module's clock will reach 0:00, counting a pause still going on. */
function currentEnd(s: RoomState, now: number): number {
  if (s.holding) return now;
  return moduleEndsAt(s) + (s.pausedAt ? now - s.pausedAt : 0);
}

/**
 * When each module is due to start from where the lesson stands now (epoch ms). The current
 * module shows when its clock started; finished modules and ones before the current one are null.
 */
export function moduleStarts(s: RoomState, now: number): (number | null)[] {
  const starts: (number | null)[] = s.plan.map(() => null);
  if (s.status !== 'live') return starts;
  starts[s.index] = s.holding ? null : currentEnd(s, now) - ((s.plan[s.index] ?? 0) * 1000);
  let t = currentEnd(s, now);
  for (let i = s.index + 1; i < s.plan.length; i++) {
    if (s.done[i]) continue;
    starts[i] = t;
    t += leftSec(s, i) * 1000;
  }
  return starts;
}

/** When the lesson is due to finish: the current module, then every unfinished one after it. */
export function finishesAt(s: RoomState, now: number): number {
  let t = currentEnd(s, now);
  for (let i = s.index + 1; i < s.plan.length; i++) t += leftSec(s, i) * 1000;
  return t;
}

/** When the room should next wake itself (the current module's end), or null. */
export function nextAlarm(s: RoomState): number | null {
  if (s.status !== 'live' || s.pausedAt !== null || s.holding) return null;
  return moduleEndsAt(s);
}

/* ---------------- re-planning ---------------- */

/**
 * Re-fits the unfinished modules from `from` on (except `skip`) into `budgetSec`. A module that
 * was left part-way keeps what it has used; only the time it has left is re-planned.
 */
function fit(s: RoomState, modules: RoomModule[], from: number, budgetSec: number, skip = -1): RoomState {
  const todo: number[] = [];
  for (let j = Math.max(0, from); j < modules.length; j++) if (j !== skip && !s.done[j]) todo.push(j);
  if (!todo.length) return { ...s, overSec: Math.max(0, -budgetSec), spareSec: 0 };
  const parts = todo.map((j) => {
    const m = modules[j];
    const used = s.spent[j] ?? 0;
    return {
      plannedSec: Math.max(STEP_SEC, m.plannedSec - used),
      pacing: m.pacing,
      minSec: Math.max(STEP_SEC, floorOf(m) - used)
    };
  });
  const r = replan(parts, 0, budgetSec);
  const plan = [...s.plan];
  todo.forEach((j, k) => (plan[j] = (s.spent[j] ?? 0) + r.seconds[k]));
  return { ...s, plan, overSec: r.overSec, spareSec: r.spareSec };
}

/** Re-fits every unfinished module after the current one into the time between its end and the bell. */
function replanRest(s: RoomState, modules: RoomModule[], now: number): RoomState {
  return fit(s, modules, s.index + 1, sec(s.endsAt - currentEnd(s, now)));
}

/** Makes module `index` current now, with every unfinished module after it re-fitted to the bell. */
function enter(s: RoomState, modules: RoomModule[], index: number, now: number): RoomState {
  const base: RoomState = {
    ...s,
    // Coming back to a module that still has time reopens its answers; one at 0:00 stays closed.
    closedAt: s.closedAt.map((c, i) => (i === index && !s.done[index] ? null : c)),
    index,
    moduleStartedAt: now,
    pausedAt: null,
    // A module whose time already ran out stays at 0:00 and waits.
    holding: !!s.done[index],
    page: s.pages[index] ?? 0,
    onBoard: false,
    spotlight: null
  };
  if (base.holding) return replanRest(base, modules, now);
  return fit(base, modules, index, sec(s.endsAt - now));
}

/** Stops the current module's clock, keeping the time it used (and the page it was on). */
function close(s: RoomState, now: number): RoomState {
  const i = s.index;
  const ran = sec((s.pausedAt ?? now) - s.moduleStartedAt);
  const spent = [...s.spent];
  const took = [...s.took];
  const done = [...s.done];
  const pages = [...s.pages];
  const closedAt = [...s.closedAt];
  took[i] = (took[i] ?? 0) + ran;
  pages[i] = s.page;
  if (!s.holding) {
    // (A module waiting at 0:00 closed when its time ran out.)
    spent[i] = Math.min(s.plan[i] ?? 0, (spent[i] ?? 0) + ran);
    if (moduleLeftMs(s, now) <= 500) done[i] = true;
    closedAt[i] = now;
  }
  return { ...s, spent, took, done, pages, closedAt, pausedAt: null };
}

/** The current module's time is up: its clock stops at 0:00 and it waits for the teacher. */
function hold(s: RoomState, now: number): RoomState {
  const c = close(s, now);
  const spent = [...c.spent];
  const done = [...c.done];
  spent[s.index] = s.plan[s.index] ?? 0;
  done[s.index] = true;
  return { ...c, spent, done, holding: true, moduleStartedAt: now };
}

/* ---------------- start and apply ---------------- */

export function startRoom(runId: string, modules: RoomModule[], endsAt: number, now: number): RoomState {
  const base: RoomState = {
    runId,
    version: 1,
    status: 'live',
    index: 0,
    plan: modules.map((m) => m.plannedSec),
    spent: modules.map(() => 0),
    took: modules.map(() => 0),
    done: modules.map(() => false),
    pages: modules.map(() => 0),
    closedAt: modules.map(() => null),
    moduleStartedAt: now,
    pausedAt: null,
    holding: false,
    endsAt,
    startedAt: now,
    endedAt: null,
    page: 0,
    pageOrder: modules.map(() => null),
    onBoard: false,
    overSec: 0,
    spareSec: 0
  };
  return modules.length ? enter(base, modules, 0, now) : base;
}

/** Checks a command from the network; returns null for anything malformed. */
export function parseCommand(v: any): Command | null {
  if (!v || typeof v !== 'object') return null;
  switch (v.type) {
    case 'next':
    case 'back':
    case 'pause':
    case 'resume':
    case 'end':
      return { type: v.type };
    case 'jump':
      return Number.isInteger(v.index) ? { type: 'jump', index: v.index } : null;
    case 'adjust': {
      const seconds = Number(v.seconds);
      return Number.isInteger(seconds) && Math.abs(seconds) <= 30 * 60 ? { type: 'adjust', seconds } : null;
    }
    case 'page':
      return Number.isInteger(v.page) && v.page >= 0 && v.page < MAX_PAGES ? { type: 'page', page: v.page } : null;
    case 'addBoard':
      return typeof v.id === 'string' && BOARD_ID.test(v.id) ? { type: 'addBoard', id: v.id } : null;
    case 'board':
      return typeof v.on === 'boolean' ? { type: 'board', on: v.on } : null;
    case 'spotlight': {
      const spot = parseSpotlight(v.spot);
      return spot === undefined ? null : { type: 'spotlight', spot };
    }
    default:
      return null;
  }
}

/**
 * Applies a teacher command. Returns the same object when nothing changes (so callers can skip
 * the save and broadcast), otherwise a new state with `version` bumped.
 */
export function apply(s: RoomState, modules: RoomModule[], cmd: Command, now: number): RoomState {
  if (s.status === 'ended') return s;
  s = upgradeState(s);
  const last = modules.length - 1;
  let next: RoomState = s;

  switch (cmd.type) {
    case 'next':
      if (s.index >= last) {
        // The last module: there's nothing to move to, so its clock stops and it waits for [end].
        if (!s.holding) next = hold(s, now);
      } else {
        next = enter(close(s, now), modules, s.index + 1, now);
      }
      break;
    case 'back':
      if (s.index > 0) next = enter(close(s, now), modules, s.index - 1, now);
      break;
    case 'jump':
      if (cmd.index >= 0 && cmd.index <= last && cmd.index !== s.index) next = enter(close(s, now), modules, cmd.index, now);
      break;
    case 'adjust': {
      const i = s.index;
      const plan = [...s.plan];
      if (s.holding) {
        // Waiting at 0:00: +1 min gives it a minute from now; taking time away does nothing.
        if (cmd.seconds <= 0) break;
        const c = close(s, now);
        const done = [...c.done];
        const closedAt = [...c.closedAt];
        done[i] = false;
        closedAt[i] = null; // reopened
        plan[i] = (c.spent[i] ?? 0) + step(cmd.seconds);
        next = replanRest({ ...c, plan, done, closedAt, holding: false, moduleStartedAt: now }, modules, now);
        break;
      }
      // More (or less) time on the current module; never below what has already passed + 15 s.
      const used = (s.spent[i] ?? 0) + sec((s.pausedAt ?? now) - s.moduleStartedAt);
      const wanted = step(plan[i] + cmd.seconds);
      plan[i] = Math.max(wanted, Math.ceil((used + STEP_SEC) / STEP_SEC) * STEP_SEC);
      if (plan[i] === s.plan[i]) break;
      next = replanRest({ ...s, plan }, modules, now);
      break;
    }
    case 'pause':
      if (s.pausedAt === null && !s.holding) next = { ...s, pausedAt: now };
      break;
    case 'resume':
      if (s.pausedAt !== null) {
        const resumed = { ...s, moduleStartedAt: s.moduleStartedAt + (now - s.pausedAt), pausedAt: null };
        next = replanRest(resumed, modules, now);
      }
      break;
    case 'page': {
      // A Notes page, or (another module) one of its boards; turning to a board puts the board up.
      const count = pagesOf(s, modules, s.index).length;
      const notes = modules[s.index]?.type === 'notes';
      if (cmd.page < count && (cmd.page !== s.page || (!notes && !s.onBoard))) next = { ...s, page: cmd.page, onBoard: !notes };
      break;
    }
    case 'addBoard': {
      // A blank blackboard right after the page on screen (a Notes module), or a new board for any
      // other module, for this delivery only. It becomes the page on screen.
      const pages = pagesOf(s, modules, s.index);
      if (pages.length >= MAX_PAGES || pages.some((p) => p.id === cmd.id)) break;
      const notes = modules[s.index]?.type === 'notes';
      const order = pages.map((p) => p.id);
      const at = notes ? Math.min(s.page + 1, order.length) : order.length;
      order.splice(at, 0, cmd.id);
      const pageOrder = [...s.pageOrder];
      pageOrder[s.index] = order;
      next = { ...s, pageOrder, page: at, onBoard: !notes };
      break;
    }
    case 'board': {
      // Another module's board up (or back to the module's own content). Notes are always pages.
      if (modules[s.index]?.type === 'notes' || cmd.on === s.onBoard) break;
      if (cmd.on && pagesOf(s, modules, s.index).length === 0) break;
      next = { ...s, onBoard: cmd.on };
      break;
    }
    case 'spotlight':
      if (cmd.spot === null && !s.spotlight) break;
      next = { ...s, spotlight: cmd.spot };
      break;
    case 'end':
      next = { ...close(s, now), status: 'ended', endedAt: now, holding: false, pausedAt: null, spotlight: null };
      break;
  }
  return next === s ? s : { ...next, version: s.version + 1 };
}

/**
 * The alarm: the current module's time is up. Modules set to 'auto' move on; 'hold' modules (and
 * the last module) stop at 0:00 and wait for the teacher, and so does a board the teacher is
 * writing on (`writing`: ink in the last few seconds). Early or stale alarms change nothing.
 */
export function timeUp(s: RoomState, modules: RoomModule[], now: number, opts: { writing?: boolean } = {}): RoomState {
  if (s.status !== 'live' || s.pausedAt !== null || s.holding) return s;
  s = upgradeState(s);
  if (moduleLeftMs(s, now) > 500) return s;
  const held = hold(s, now);
  const m = modules[s.index];
  // Never pull the board away mid-sentence: if the teacher is writing on it, wait for them.
  const writing = !!opts.writing && livePage(s, modules) !== null;
  if (s.index < modules.length - 1 && m?.onTimeUp !== 'hold' && !writing) {
    return { ...enter(held, modules, s.index + 1, now), version: s.version + 1 };
  }
  return { ...held, version: s.version + 1 };
}
