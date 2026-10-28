// src/lib/coliseumBoards.ts
// Single source of truth for how Coliseum leaderboards are organised.
// Imported by the API (functions/api/leaderboard.js), the leaderboard UI, and the games that
// need a level multiplier, so they can never disagree.
//
// Hierarchy:   game  ->  event  ->  filters (level band, variant, class, timeframe)
//   * An EVENT is the unit that can be ranked: sprint scores, race times and endurance scores
//     are different measurements and are never merged with each other.
//   * Inside an event, every player's best result is stored per (level, variant) and the
//     "all settings" board is built at query time, one row per player (their best).
//   * Level BANDS and VARIANTS are filters over those same rows, not separate boards.

export type EventId = '60s' | 'endurance' | 'streak' | 'race10' | 'other';
export type RankBy = 'score' | 'time';

export interface EventDef {
  label: string;
  /** score events rank by highest score; time events rank by fastest (level-adjusted) time */
  rankBy: RankBy;
}

export const EVENTS: Record<EventId, EventDef> = {
  race10: { label: 'race', rankBy: 'time' },
  '60s': { label: 'sprint (60s)', rankBy: 'score' },
  endurance: { label: 'endurance', rankBy: 'score' },
  streak: { label: 'streak', rankBy: 'score' },
  other: { label: 'other', rankBy: 'score' }
};

/** display order of events inside a game */
export const EVENT_ORDER: EventId[] = ['race10', '60s', 'endurance', 'streak', 'other'];

export interface Band {
  id: string;
  label: string;
  lo: number;
  hi: number;
  /** highlighted as the top "ranked ladder" */
  ladder?: boolean;
}

export interface GameDef {
  /** number of levels (levels are 1..levels) */
  levels?: number;
  /** optional names for levels, e.g. 1: 'basic' */
  levelNames?: Record<number, string>;
  /** level bands offered as filter chips; games with few levels can list levels directly instead */
  bands?: Band[];
  /** filterable variants that are part of the stored stratum (e.g. typed answers) */
  variants?: { id: string; label: string }[];
  /** race-time weight per level, before RACE_LEVEL_FAVOR is applied (index 0 = level 1) */
  raceWeights?: number[];
}

/** AlgebraicStepFinder score multipliers. Also used as the base race-time weight. */
export const ASF_MULTIPLIERS = [1.0, 1.2, 1.4, 1.7, 2.0, 2.4, 2.8, 3.3, 3.9, 4.5];

/**
 * How strongly the "all levels" race board leans toward higher levels.
 * adjusted time = raw time / (level multiplier ^ RACE_LEVEL_FAVOR)
 * 1.0 = plain multiplier; larger values reward high levels more. Level 10 is 4.5x at 1.0
 * and about 5.2x at 1.1.
 */
export const RACE_LEVEL_FAVOR = 1.1;

export const GAMES: Record<string, GameDef> = {
  'algebraic-step-finder': {
    levels: 10,
    bands: [
      { id: '1-3', label: 'levels 1-3', lo: 1, hi: 3 },
      { id: '4-6', label: 'levels 4-6', lo: 4, hi: 6 },
      { id: '7-9', label: 'levels 7-9', lo: 7, hi: 9 },
      { id: '10', label: 'level 10 ranked ladder', lo: 10, hi: 10, ladder: true }
    ],
    raceWeights: ASF_MULTIPLIERS
  },
  'split-the-middle': {
    levels: 3,
    levelNames: { 1: 'basic', 2: 'standard', 3: 'crazy' },
    variants: [{ id: 'typed', label: 'typed answers' }]
  }
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Turn an old-style challenge id ("gcd-racer-60s", "split-the-middle-60s-d2-typed",
 * "algebraic-step-finder-race10-lin-rt") into { game, event }. Anything after the event token is
 * ignored: it is carried by the explicit level / variant / tags fields now.
 */
export function parseChallengeId(id: string): { game: string; event: EventId } {
  const clean = (id || '').trim().toLowerCase();
  const m = clean.match(/^(.*?)-(race10|60s|endurance|streak)(?:-.*)?$/);
  if (m) return { game: m[1], event: m[2] as EventId };
  return { game: clean, event: 'other' };
}

export const isEventId = (e: string): e is EventId => e in EVENTS;

/** Level used for ranking weights and filters; 0 means "no level" (legacy rows, games without levels). */
export function normalizeLevel(game: string, raw: unknown): number {
  const n = typeof raw === 'number' ? Math.trunc(raw) : parseInt(String(raw ?? ''), 10);
  const max = GAMES[game]?.levels ?? 0;
  return Number.isFinite(n) && n >= 1 && n <= max ? n : 0;
}

export function normalizeVariant(game: string, raw: unknown): string {
  const v = String(raw ?? '').trim().toLowerCase();
  return GAMES[game]?.variants?.some(x => x.id === v) ? v : '';
}

/** free-form, non-stratifying info about a run (e.g. which equation types were on) */
export function normalizeTags(raw: unknown): string {
  return String(raw ?? '').toLowerCase().replace(/[^a-z0-9,-]/g, '').slice(0, 40);
}

export const bandOf = (game: string, level: number): Band | undefined =>
  GAMES[game]?.bands?.find(b => level >= b.lo && level <= b.hi);

/** Race-time weight for a level: multiplier ^ RACE_LEVEL_FAVOR (1 when the game has no weights). */
export function raceWeight(game: string, level: number): number {
  const w = GAMES[game]?.raceWeights?.[level - 1];
  return w && level >= 1 ? Math.pow(w, RACE_LEVEL_FAVOR) : 1;
}

export function levelLabel(game: string, level: number): string {
  if (!level) return '';
  const name = GAMES[game]?.levelNames?.[level];
  return name ? `${level} ${name}` : `L${level}`;
}