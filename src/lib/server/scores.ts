// src/lib/server/scores.ts
// Coliseum games played inside a lesson. Every result is kept for the teacher (lesson_scores);
// it also goes to the public leaderboard only when the class has posting turned on, and then
// under the student's separate leaderboard name, never their lesson alias.

import { generateAlias } from '../pseudonym.ts';
import { isKnownTeacher } from '../teachers.ts';
import { newId } from './crypto.ts';
import { isProfane, upsertLeaderboardEntry, type GameScore } from './leaderboard.ts';
import type { Student } from './sessions.ts';

/** Game results kept per student per day, so a stuck game can't flood the table. */
export const MAX_SCORES_PER_DAY = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BoardStatus {
  /** Whether this student's scores go to the public leaderboard. */
  posting: boolean;
  /** Their leaderboard name (null until posting is on and they've been given one). */
  name: string | null;
  /** True once a score was posted under it: it can't be rerolled any more. */
  fixed: boolean;
}

/** Posting needs the class switch on, a real (non-sandbox) class, and leaderboard-valid codes. */
async function postingAllowed(db: any, s: Student): Promise<boolean> {
  if (s.test || !/^P[0-9]$/.test(s.period) || !isKnownTeacher(s.boardCode)) return false;
  const row = await db.prepare('SELECT leaderboard_posting FROM classes WHERE id = ?1').bind(s.classId).first();
  return !!row?.leaderboard_posting;
}

/** A generated name that is nobody's lesson alias, nobody else's board name and not already on the board. */
async function freshBoardName(db: any, profanityList?: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const name = generateAlias();
    const clash = await db
      .prepare(
        `SELECT 1 AS hit FROM student_aliases WHERE alias_lower = ?2 OR board_name = ?1
         UNION ALL SELECT 1 FROM leaderboard_entries WHERE display_name = ?1 LIMIT 1`
      )
      .bind(name, name.toLowerCase())
      .first();
    if (!clash && !(await isProfane(name, profanityList))) return name;
  }
  throw new Error('Could not find a free leaderboard name.');
}

async function readName(db: any, aliasId: string) {
  return db.prepare('SELECT board_name, board_name_fixed FROM student_aliases WHERE id = ?1').bind(aliasId).first();
}

/**
 * The student's posting status. When posting is on and they have no name yet, one is made now,
 * so they see it before their first post. `reroll` swaps it, until a score has been posted.
 */
export async function boardStatus(db: any, s: Student, opts: { reroll?: boolean; profanityList?: string } = {}): Promise<BoardStatus> {
  const posting = await postingAllowed(db, s);
  let row = await readName(db, s.aliasId);
  if (posting && (!row?.board_name || (opts.reroll && !row.board_name_fixed))) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const name = await freshBoardName(db, opts.profanityList);
        await db
          .prepare('UPDATE student_aliases SET board_name = ?2 WHERE id = ?1 AND board_name_fixed = 0')
          .bind(s.aliasId, name)
          .run();
        break;
      } catch (e) {
        if (!/UNIQUE/i.test(String((e as Error)?.message ?? e))) throw e; // a race for the same name: try again
      }
    }
    row = await readName(db, s.aliasId);
  }
  return { posting, name: row?.board_name ?? null, fixed: !!row?.board_name_fixed };
}

/**
 * Keeps a lesson game result, and posts it under the student's leaderboard name when the class
 * allows. Returns what happened, for the game's end screen.
 */
export async function recordLessonScore(
  db: any,
  s: Student,
  score: GameScore,
  opts: { profanityList?: string; now?: number; post?: boolean; target?: { runId: string; moduleId: string } | null } = {}
): Promise<{ kept: boolean; posted: boolean; name: string | null }> {
  const now = opts.now ?? Date.now();
  const { n } = await db
    .prepare('SELECT COUNT(*) AS n FROM lesson_scores WHERE alias_id = ?1 AND created_at > ?2')
    .bind(s.aliasId, now - DAY_MS)
    .first();
  if (n >= MAX_SCORES_PER_DAY) return { kept: false, posted: false, name: null };

  const status = await boardStatus(db, s, { profanityList: opts.profanityList });
  const posted = opts.post !== false && status.posting && !!status.name;
  if (posted) {
    await upsertLeaderboardEntry(db, { ...score, displayName: status.name!, period: s.period, teacher: s.boardCode });
    await db.prepare('UPDATE student_aliases SET board_name_fixed = 1 WHERE id = ?1').bind(s.aliasId).run();
  }
  await db
    .prepare(
      `INSERT INTO lesson_scores (id, alias_id, class_id, game, event, level, variant, score, duration_ms, posted, created_at, run_id, module_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
    )
    .bind(newId(), s.aliasId, s.classId, score.game, score.event, score.level, score.variant,
      Math.round(score.score), Math.round(score.durationMs), posted ? 1 : 0, now,
      opts.target?.runId ?? null, opts.target?.moduleId ?? null)
    .run();
  return { kept: true, posted, name: posted ? status.name : null };
}
