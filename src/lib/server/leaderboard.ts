// src/lib/server/leaderboard.ts
// Writing to the public Coliseum leaderboard, shared by the public form (functions/api/leaderboard.js,
// device aliases) and lesson play (functions/api/class/score.js, the student's board name).
// Moved here unchanged from functions/api/leaderboard.js.

import {
  EVENTS,
  isEventId,
  normalizeLevel,
  normalizeTags,
  normalizeVariant,
  parseChallengeId,
  type EventId
} from '../coliseumBoards.ts';

let cachedBlocklist: string[] | null = null;

async function getBlocklist(secretList?: string): Promise<string[]> {
  if (secretList) {
    return secretList.split(',').map(w => normalizeText(w)).filter(w => w.length > 0);
  }
  if (cachedBlocklist) return cachedBlocklist;

  const languages = ['en', 'es', 'fr', 'de'];
  let wordSet = new Set<string>();
  
  for (const lang of languages) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/censor-text/profanity-list/main/list/${lang}.txt`);
      if (res.ok) {
        const text = await res.text();
        text.split('\n').forEach(w => {
          const cleaned = normalizeText(w);
          if (cleaned.length > 0 && !w.trim().startsWith('#')) {
            wordSet.add(cleaned);
          }
        });
      }
    } catch (e) {
      // Fail silently for individual languages, fall back gracefully
    }
  }

  if (wordSet.size === 0) {
    ['BADWORDS'].forEach(w => wordSet.add(w));
  }

  cachedBlocklist = Array.from(wordSet);
  return cachedBlocklist;
}

function normalizeText(text: string): string {
  if (!text) return '';
  let upper = text.toUpperCase();

  const leetMap: Record<string, string> = {
    '0': 'O', '1': 'I', '!': 'I', '|': 'I',
    '3': 'E', '4': 'A', '@': 'A', '5': 'S',
    '$': 'S', '7': 'T', '8': 'B', '9': 'G'
  };

  upper = upper.split('').map(char => leetMap[char] || char).join('');
  upper = upper.replace(/[^A-Z0-9]/g, '');
  upper = upper.replace(/(.)\1{2,}/g, '$1');

  return upper;
}

export async function isProfane(text: string, secretList?: string): Promise<boolean> {
  if (!text) return false;
  
  // normalizeText() returns UPPERCASE and so do the blocklist entries, so compare in uppercase
  // (this used to lowercase one side, which meant no blocklist word could ever match).
  const normalized = normalizeText(text);
  const qToGVariant = normalized.replace(/Q/g, 'G');

  // Explicitly catch common custom spellings that bypass standard blocklists
  const explicitVariations = ['NIQR', 'NIQQ', 'NIGQ', 'NIGR', 'NIGG', 'NIQG', 'NIQE', 'NIKKR', 'KKK', 'NIKKER', 'NICKER', 'NICR', 'NICCR','NICCCR', 'NIKR', 'NICKR', 'NIKCR', 'NIKCCR', 'NIKKCR', 'NIKCKR', 'NICKKR', 'NICCKR', 'NICKCR'];
  
  if (explicitVariations.some(term => normalized.includes(term) || qToGVariant.includes(term))) {
    return true;
  }

  // Fallback to checking the standard blocklist
  const list = await getBlocklist(secretList);
  return list.some(word => word.length > 0 && (normalized.includes(word) || qToGVariant.includes(word)));
} 

/** Whether a name belongs to a student's lesson leaderboard name (migration 0006). */
export async function isLessonBoardName(db: any, name: string): Promise<boolean> {
  try {
    return !!(await db.prepare('SELECT 1 AS hit FROM student_aliases WHERE board_name = ?1').bind(name).first());
  } catch {
    return false; // database without the lesson tables
  }
}

/** A score as a game reports it, checked. Returns an error string when the payload is bad. */
export interface GameScore {
  game: string;
  event: EventId;
  level: number;
  variant: string;
  tags: string;
  score: number;
  durationMs: number;
}

export function cleanGameScore(body: any): GameScore | string {
  let game = body?.game;
  let event = body?.event;
  if (!game && body?.challenge_id) ({ game, event } = parseChallengeId(body.challenge_id));
  game = String(game || '').trim().toLowerCase();
  const { score, duration_ms } = body ?? {};
  if (
    !/^[a-z0-9-]{1,60}$/.test(game) ||
    !isEventId(String(event)) ||
    typeof score !== 'number' || !Number.isFinite(score) ||
    typeof duration_ms !== 'number' || !Number.isFinite(duration_ms)
  ) {
    return 'Invalid payload';
  }
  return {
    game,
    event: event as EventId,
    level: normalizeLevel(game, body.level),
    variant: normalizeVariant(game, body.variant),
    tags: normalizeTags(body.tags),
    score,
    durationMs: duration_ms
  };
}

export const schoolYearOf = (now = new Date()) => {
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

/** Keeps a player's best result per stratum. Callers have already checked name, period and teacher. */
export async function upsertLeaderboardEntry(
  db: any,
  e: GameScore & { displayName: string; period: string; teacher: string }
): Promise<string> {
  const schoolYear = schoolYearOf();

  const insertSql = `
    INSERT INTO leaderboard_entries
      (game, event, level, variant, tags, display_name, class_period, teacher, school_year, score, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(game, event, level, variant, display_name)
  `;

  // Score events keep a player's best score in a stratum (fastest time breaks ties).
  const scoreRankedUpsert = `
    DO UPDATE SET
      score = MAX(leaderboard_entries.score, excluded.score),
      duration_ms = CASE
        WHEN excluded.score > leaderboard_entries.score THEN excluded.duration_ms
        WHEN excluded.score = leaderboard_entries.score THEN MIN(leaderboard_entries.duration_ms, excluded.duration_ms)
        ELSE leaderboard_entries.duration_ms
      END,
      tags = CASE
        WHEN excluded.score > leaderboard_entries.score THEN excluded.tags
        ELSE leaderboard_entries.tags
      END,
      class_period = excluded.class_period,
      teacher = excluded.teacher,
      created_at = CASE
        WHEN excluded.score > leaderboard_entries.score THEN datetime('now')
        ELSE leaderboard_entries.created_at
      END
  `;

  // Time events keep a player's fastest time in a stratum (higher score breaks ties).
  const timeRankedUpsert = `
    DO UPDATE SET
      duration_ms = MIN(leaderboard_entries.duration_ms, excluded.duration_ms),
      score = CASE
        WHEN excluded.duration_ms < leaderboard_entries.duration_ms THEN excluded.score
        WHEN excluded.duration_ms = leaderboard_entries.duration_ms THEN MAX(leaderboard_entries.score, excluded.score)
        ELSE leaderboard_entries.score
      END,
      tags = CASE
        WHEN excluded.duration_ms < leaderboard_entries.duration_ms THEN excluded.tags
        ELSE leaderboard_entries.tags
      END,
      class_period = excluded.class_period,
      teacher = excluded.teacher,
      created_at = CASE
        WHEN excluded.duration_ms < leaderboard_entries.duration_ms THEN datetime('now')
        ELSE leaderboard_entries.created_at
      END
  `;

  await db.prepare(
    insertSql + (EVENTS[e.event as EventId].rankBy === 'time' ? timeRankedUpsert : scoreRankedUpsert)
  ).bind(
    e.game, e.event, e.level, e.variant, e.tags,
    e.displayName, e.period, e.teacher, schoolYear,
    Math.round(e.score), Math.round(e.durationMs)
  ).run();

  return schoolYear;
}
