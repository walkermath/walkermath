// src/lib/server/classes.ts
// Data access for classes and their alias rosters. Every query is scoped by teacher id.

import { generateAlias } from '../pseudonym.ts';
import { generatePasscode, generatePin } from '../classroom.ts';
import { hmacHex, newId } from './crypto.ts';

export const MAX_ALIASES_PER_CLASS = 80;
export const MAX_ALIASES_PER_REQUEST = 60;

export interface ClassRow {
  id: string;
  name: string;
  period: string;
  passcode: string;
  bellStart: string | null;
  bellEnd: string | null;
  archived: boolean;
  /** Lesson game scores also go to the public leaderboard (off until the teacher turns it on). */
  leaderboardPosting: boolean;
  createdAt: number;
  activeAliases?: number;
}

export const toClass = (r: any): ClassRow => ({
  id: r.id,
  name: r.name,
  period: r.period,
  passcode: r.passcode,
  bellStart: r.bell_start ?? null,
  bellEnd: r.bell_end ?? null,
  archived: !!r.archived,
  leaderboardPosting: !!r.leaderboard_posting,
  createdAt: r.created_at,
  ...(r.active_aliases !== undefined ? { activeAliases: Number(r.active_aliases) } : {})
});

export async function listClasses(db: any, teacherId: string): Promise<ClassRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM student_aliases a WHERE a.class_id = c.id AND a.retired = 0) AS active_aliases
         FROM classes c WHERE c.teacher_id = ?1
        ORDER BY c.archived, c.period, c.name`
    )
    .bind(teacherId)
    .all();
  return results.map(toClass);
}

/** The class if this teacher owns it, else null (callers answer 404 either way). */
export async function ownedClass(db: any, teacherId: string, classId: unknown): Promise<ClassRow | null> {
  if (typeof classId !== 'string' || classId.length > 64) return null;
  const row = await db.prepare('SELECT * FROM classes WHERE id = ?1 AND teacher_id = ?2').bind(classId, teacherId).first();
  return row ? toClass(row) : null;
}

const isUniqueError = (e: unknown) => /UNIQUE/i.test(String((e as Error)?.message ?? e));

/** Run `attempt(passcode)` with fresh passcodes until it doesn't collide (at most 8 tries). */
export async function withFreshPasscode<T>(attempt: (passcode: string) => Promise<T>): Promise<T> {
  for (let i = 0; i < 8; i++) {
    try {
      return await attempt(generatePasscode());
    } catch (e) {
      if (!isUniqueError(e)) throw e;
    }
  }
  throw new Error('Could not find a free passcode.');
}

export const pinHash = (secret: string, aliasId: string, pin: string) => hmacHex(secret, `pin:${aliasId}:${pin}`);

export interface NewAlias {
  id: string;
  alias: string;
  pin: string; // returned once, never stored
}

/** Create `count` alias + PIN pairs in one transaction; retried if an alias happens to collide. */
export async function createAliases(db: any, secret: string, classId: string, count: number): Promise<NewAlias[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const seen = new Set<string>();
    const created: NewAlias[] = [];
    while (created.length < count) {
      const alias = generateAlias();
      if (seen.has(alias.toLowerCase())) continue;
      seen.add(alias.toLowerCase());
      created.push({ id: newId(), alias, pin: generatePin() });
    }

    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO student_aliases (id, class_id, alias, alias_lower, pin_hash, retired, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)`
    );
    const statements = await Promise.all(
      created.map(async (a) => insert.bind(a.id, classId, a.alias, a.alias.toLowerCase(), await pinHash(secret, a.id, a.pin), now))
    );
    try {
      await db.batch(statements);
      return created;
    } catch (e) {
      if (!isUniqueError(e)) throw e;
    }
  }
  throw new Error('Could not create unique aliases.');
}

export async function listAliases(db: any, classId: string) {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.alias, a.retired, a.created_at, a.board_name,
              (SELECT COUNT(*) FROM student_sessions s WHERE s.alias_id = a.id AND s.expires_at > ?2) AS devices
         FROM student_aliases a WHERE a.class_id = ?1
        ORDER BY a.retired, a.created_at, a.alias`
    )
    .bind(classId, Date.now())
    .all();
  return results.map((r: any) => ({
    id: r.id,
    alias: r.alias,
    retired: !!r.retired,
    createdAt: r.created_at,
    devices: Number(r.devices),
    /** Their public leaderboard name, once they have one. Shown to the teacher only. */
    boardName: r.board_name ?? null
  }));
}

/** Signs every device in the class out (used when the passcode is rotated with "sign everyone out"). */
export const signOutClass = (db: any, classId: string) =>
  db
    .prepare('DELETE FROM student_sessions WHERE alias_id IN (SELECT id FROM student_aliases WHERE class_id = ?1)')
    .bind(classId)
    .run();

export const signOutAlias = (db: any, aliasId: string) =>
  db.prepare('DELETE FROM student_sessions WHERE alias_id = ?1').bind(aliasId).run();
