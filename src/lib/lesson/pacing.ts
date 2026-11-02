// src/lib/lesson/pacing.ts
// The pacing engine: one pure function, no framework imports. The live room (Phase 4), the
// control panel and the lesson builder's preview all call replan().
//
// The bell doesn't move, so the lesson's end is fixed and any overrun or early finish is absorbed
// by the modules still to come:
//   1. Locked modules (an exit ticket, say) keep their planned time.
//   2. Flex modules share what's left in proportion to their planned length,
//      never below their floor (min_sec, default half the plan) and never above 1.5x the plan.
//   3. Times are rounded to 15-second steps; rounding drift goes to the longest flex module.
//   4. If even the floors don't fit, every flex module sits at its floor and `overSec` says by how
//      much the lesson will run past the end. If every flex module is at its cap, `spareSec` is
//      the time left over for the teacher to place.

import { STEP_SEC } from './time.ts';

export type Pacing = 'flex' | 'locked';

export interface PlanModule {
  plannedSec: number;
  pacing: Pacing;
  /** Shortest a flex module may be squeezed to; null/undefined = half its plan. */
  minSec?: number | null;
}

export interface Replan {
  /** New length of each module from `fromIndex` on, in order. */
  seconds: number[];
  /** How far past the lesson's end the floors alone would run (0 if they fit). */
  overSec: number;
  /** Time no module can absorb because every flex module is at 1.5x its plan. */
  spareSec: number;
}

export const MAX_GROWTH = 1.5;

const down = (s: number) => Math.floor(s / STEP_SEC) * STEP_SEC;
const up = (s: number) => Math.ceil(s / STEP_SEC) * STEP_SEC;
const nearest = (s: number) => Math.round(s / STEP_SEC) * STEP_SEC;

/** The floor a flex module can be squeezed to (always a 15-s step, never above its plan). */
export function floorOf(m: PlanModule): number {
  const raw = m.minSec == null ? m.plannedSec / 2 : m.minSec;
  return Math.min(m.plannedSec, Math.max(STEP_SEC, up(raw)));
}

export const capOf = (m: PlanModule): number => Math.max(m.plannedSec, down(m.plannedSec * MAX_GROWTH));

/**
 * Re-fit modules[fromIndex..] into `budgetSec`, the time between the current module's end and the
 * lesson's end.
 */
export function replan(modules: PlanModule[], fromIndex: number, budgetSec: number): Replan {
  const rest = modules.slice(Math.max(0, fromIndex));
  const seconds = rest.map((m) => m.plannedSec);
  const flex = rest.map((m, i) => (m.pacing === 'flex' ? i : -1)).filter((i) => i >= 0);

  const locked = rest.reduce((sum, m) => sum + (m.pacing === 'locked' ? m.plannedSec : 0), 0);
  const forFlex = budgetSec - locked;

  if (flex.length === 0) {
    return { seconds, overSec: Math.max(0, -forFlex), spareSec: Math.max(0, forFlex) };
  }

  const floors = flex.map((i) => floorOf(rest[i]));
  const caps = flex.map((i) => capOf(rest[i]));
  const floorTotal = floors.reduce((a, b) => a + b, 0);
  const capTotal = caps.reduce((a, b) => a + b, 0);

  if (forFlex <= floorTotal) {
    flex.forEach((i, k) => (seconds[i] = floors[k]));
    return { seconds, overSec: floorTotal - forFlex, spareSec: 0 };
  }
  if (forFlex >= capTotal) {
    flex.forEach((i, k) => (seconds[i] = caps[k]));
    return { seconds, overSec: 0, spareSec: forFlex - capTotal };
  }

  // Proportional share. A module that hits its floor (or cap) is pinned there and the rest is
  // shared again among the others; scale only moves one way, so this settles in <= n rounds.
  const pinned = new Map<number, number>(); // k -> seconds
  for (let round = 0; round <= flex.length; round++) {
    const free = flex.map((_, k) => k).filter((k) => !pinned.has(k));
    const pinnedTotal = [...pinned.values()].reduce((a, b) => a + b, 0);
    const freePlanned = free.reduce((sum, k) => sum + rest[flex[k]].plannedSec, 0);
    const scale = (forFlex - pinnedTotal) / freePlanned;
    let changed = false;
    for (const k of free) {
      const x = rest[flex[k]].plannedSec * scale;
      if (x < floors[k]) (pinned.set(k, floors[k]), (changed = true));
      else if (x > caps[k]) (pinned.set(k, caps[k]), (changed = true));
    }
    if (!changed) {
      for (const k of free) seconds[flex[k]] = nearest(rest[flex[k]].plannedSec * scale);
      break;
    }
  }
  for (const [k, s] of pinned) seconds[flex[k]] = s;

  // Rounding drift goes to the longest flex module that isn't pinned (or the longest overall).
  const drift = forFlex - flex.reduce((sum, i) => sum + seconds[i], 0);
  if (drift !== 0) {
    const candidates = flex.map((_, k) => k).filter((k) => !pinned.has(k));
    const pool = candidates.length ? candidates : flex.map((_, k) => k);
    const k = pool.reduce((best, c) => (rest[flex[c]].plannedSec > rest[flex[best]].plannedSec ? c : best), pool[0]);
    seconds[flex[k]] += drift;
  }
  return { seconds, overSec: 0, spareSec: 0 };
}

export const totalSec = (modules: { plannedSec: number }[]): number =>
  modules.reduce((sum, m) => sum + m.plannedSec, 0);

/**
 * Builder preview: "if module `index` runs `extraSec` long (or short), the rest become ...".
 * The lesson keeps its planned total (`lessonSec`, defaulting to the sum of the plan).
 */
export function previewOverrun(modules: PlanModule[], index: number, extraSec: number, lessonSec = totalSec(modules)): Replan {
  const usedSoFar = totalSec(modules.slice(0, index + 1)) + extraSec;
  return replan(modules, index + 1, lessonSec - usedSoFar);
}
