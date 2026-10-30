// src/lib/lesson/room.ts
// The live lesson's state machine: pure functions, no I/O. The LessonRoom Durable Object
// (live-worker/) stores the state and calls apply() for every teacher command and every alarm;
// the control panel and the student view use the clock helpers to draw countdowns.
//
// The room stores timestamps, never a ticking counter: the current module started at
// `moduleStartedAt` and is planned to last `plan[index]` seconds. Devices compute the time left
// themselves from `serverNow`, so nothing is broadcast once a second.
//
// The bell doesn't move (`endsAt`), so every change re-plans the modules still to come with
// replan(): overruns and early finishes are absorbed by the flex modules.

import { replan, type Pacing } from './pacing.ts';
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
  /** Seconds per module: what done modules actually took, what the rest are planned to take now. */
  plan: number[];
  moduleStartedAt: number;
  /** Set while paused; the clock is frozen at this moment. */
  pausedAt: number | null;
  /** The current module's time is up and it waits for the teacher (onTimeUp 'hold', or the last module). */
  holding: boolean;
  /** The bell (epoch ms). */
  endsAt: number;
  startedAt: number;
  endedAt: number | null;
  /** The page the teacher shows in a Notes module (students can browse the others). */
  page: number;
  /** From the latest re-plan: how far the floors run past the bell, and time nothing can absorb. */
  overSec: number;
  spareSec: number;
}

export type Command =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'jump'; index: number }
  | { type: 'adjust'; seconds: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'page'; page: number }
  | { type: 'end' };

const sec = (ms: number) => Math.round(ms / 1000);
const step = (s: number) => Math.max(STEP_SEC, Math.round(s / STEP_SEC) * STEP_SEC);

/* ---------------- the clock ---------------- */

/** When the current module is due to end (epoch ms), counting any pause. */
export function moduleEndsAt(s: RoomState): number {
  return s.moduleStartedAt + (s.plan[s.index] ?? 0) * 1000;
}

/** Milliseconds left in the current module at `now` (negative once it has run over). */
export function moduleLeftMs(s: RoomState, now: number): number {
  return moduleEndsAt(s) - (s.pausedAt ?? now);
}

/** Milliseconds until the bell at `now`. */
export const lessonLeftMs = (s: RoomState, now: number) => s.endsAt - now;

/** Planned start time of every module (epoch ms), from where the lesson stands now. */
export function moduleStarts(s: RoomState, now: number): number[] {
  const starts: number[] = [];
  let t = s.startedAt;
  for (let i = 0; i < s.plan.length; i++) {
    if (i === s.index) t = s.moduleStartedAt + (s.pausedAt ? now - s.pausedAt : 0);
    starts.push(t);
    t += s.plan[i] * 1000;
  }
  return starts;
}

/** When the room should next wake itself (the current module's end), or null. */
export function nextAlarm(s: RoomState): number | null {
  if (s.status !== 'live' || s.pausedAt !== null || s.holding) return null;
  return moduleEndsAt(s);
}

/* ---------------- re-planning ---------------- */

/** Re-fits modules after the current one into the time between its end and the bell. */
function replanRest(s: RoomState, modules: RoomModule[], now: number): RoomState {
  const from = s.index + 1;
  if (from >= modules.length) return { ...s, overSec: Math.max(0, sec(moduleEndsAt(s) - s.endsAt)), spareSec: 0 };
  const pausedFor = s.pausedAt ? now - s.pausedAt : 0;
  const budget = sec(s.endsAt - (moduleEndsAt(s) + pausedFor));
  const r = replan(modules, from, budget);
  return { ...s, plan: [...s.plan.slice(0, from), ...r.seconds], overSec: r.overSec, spareSec: r.spareSec };
}

/** Starts module `index` now, with the rest of the lesson (it included) re-fitted to the bell. */
function enter(s: RoomState, modules: RoomModule[], index: number, now: number): RoomState {
  const r = replan(modules, index, sec(s.endsAt - now));
  return {
    ...s,
    index,
    plan: [...s.plan.slice(0, index), ...r.seconds],
    moduleStartedAt: now,
    pausedAt: null,
    holding: false,
    page: 0,
    overSec: r.overSec,
    spareSec: r.spareSec
  };
}

/** Records how long the current module really took (whole seconds), before moving away from it. */
function close(s: RoomState, now: number): RoomState {
  const plan = [...s.plan];
  plan[s.index] = Math.max(0, sec((s.pausedAt ?? now) - s.moduleStartedAt));
  return { ...s, plan };
}

/* ---------------- start and apply ---------------- */

export function startRoom(runId: string, modules: RoomModule[], endsAt: number, now: number): RoomState {
  const base: RoomState = {
    runId,
    version: 1,
    status: 'live',
    index: 0,
    plan: modules.map((m) => m.plannedSec),
    moduleStartedAt: now,
    pausedAt: null,
    holding: false,
    endsAt,
    startedAt: now,
    endedAt: null,
    page: 0,
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
      return Number.isInteger(v.page) && v.page >= 0 && v.page < 500 ? { type: 'page', page: v.page } : null;
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
  const last = modules.length - 1;
  let next: RoomState = s;

  switch (cmd.type) {
    case 'next':
      if (s.index >= last) {
        // The last module: there's nothing to move to, so just stop its clock and wait for [end].
        next = s.holding ? s : { ...close(s, now), holding: true, pausedAt: null };
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
      // More (or less) time on the current module; never below what has already passed + 15 s.
      const elapsed = sec((s.pausedAt ?? now) - s.moduleStartedAt);
      const plan = [...s.plan];
      const wanted = step(plan[s.index] + cmd.seconds);
      plan[s.index] = Math.max(wanted, Math.ceil((elapsed + STEP_SEC) / STEP_SEC) * STEP_SEC);
      if (plan[s.index] === s.plan[s.index] && !s.holding) break;
      next = replanRest({ ...s, plan, holding: false }, modules, now);
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
    case 'page':
      if (modules[s.index]?.type === 'notes' && cmd.page !== s.page) next = { ...s, page: cmd.page };
      break;
    case 'end':
      next = { ...close(s, now), status: 'ended', endedAt: now, holding: false, pausedAt: null };
      break;
  }
  return next === s ? s : { ...next, version: s.version + 1 };
}

/**
 * The alarm: the current module's time is up. Modules set to 'auto' move on; 'hold' modules (and
 * the last module) stop and wait for the teacher. Early or stale alarms change nothing.
 */
export function timeUp(s: RoomState, modules: RoomModule[], now: number): RoomState {
  if (s.status !== 'live' || s.pausedAt !== null || s.holding || moduleLeftMs(s, now) > 500) return s;
  const m = modules[s.index];
  if (s.index < modules.length - 1 && m?.onTimeUp !== 'hold') return apply(s, modules, { type: 'next' }, now);
  return { ...s, holding: true, version: s.version + 1 };
}
