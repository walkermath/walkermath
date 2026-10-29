// src/lib/server/sessions.ts
// Teacher and student sessions. The browser holds a random token in an HttpOnly cookie; the
// database holds only its SHA-256, so a database leak cannot be replayed as a login.

import { randomToken, sha256Hex } from './crypto.ts';
import { clearCookie, readCookie, setCookie } from './http.ts';
import { teacherAccounts } from './accounts.ts';

export const TEACHER_COOKIE = '__Host-wm_teacher';
export const STUDENT_COOKIE = '__Host-wm_student';
/** Holds state.nonce.verifier for 10 minutes during Google sign-in. */
export const OAUTH_COOKIE = '__Host-wm_oauth';

const DAY = 24 * 60 * 60 * 1000;
export const TEACHER_SESSION_MS = 30 * DAY;

/** Student devices stay signed in until the school-year rollover (July 1), like the leaderboard. */
export function studentSessionExpiry(now = Date.now()): number {
  const d = new Date(now);
  const year = d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return Date.UTC(year, 6, 1, 5); // July 1, 00:00 Central (05:00 UTC)
}

export interface Teacher {
  id: string;
  email: string;
  displayName: string;
  boardCode: string;
  sandbox: boolean;
  timeZone: string;
}

export interface Student {
  aliasId: string;
  alias: string;
  classId: string;
  className: string;
  period: string;
  boardCode: string;
  test: boolean;
}

/** What a student's own browser is told about their session. */
export const publicStudent = (s: Student) => ({
  alias: s.alias,
  className: s.className,
  period: s.period,
  teacher: s.boardCode,
  test: s.test
});

/* ---------------- teachers ---------------- */

export async function startTeacherSession(db: any, teacherId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await db
    .prepare('INSERT INTO teacher_sessions (token_hash, teacher_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256Hex(token), teacherId, now, now + TEACHER_SESSION_MS)
    .run();
  return setCookie(TEACHER_COOKIE, token, TEACHER_SESSION_MS / 1000);
}

export async function currentTeacher(env: any, request: Request): Promise<Teacher | null> {
  const token = readCookie(request, TEACHER_COOKIE);
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    `SELECT t.id, t.email, t.display_name, t.board_code, t.sandbox, t.time_zone
       FROM teacher_sessions s JOIN teachers t ON t.id = s.teacher_id
      WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  )
    .bind(await sha256Hex(token), Date.now())
    .first();
  if (!row) return null;

  // Still on the allowlist? Removing an email from TEACHER_ACCOUNTS ends its sessions at once.
  const account = teacherAccounts(env).get(String(row.email).toLowerCase());
  if (!account) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    boardCode: account.boardCode,
    sandbox: account.sandbox,
    timeZone: row.time_zone
  };
}

export async function endTeacherSession(db: any, request: Request): Promise<string> {
  const token = readCookie(request, TEACHER_COOKIE);
  if (token) await db.prepare('DELETE FROM teacher_sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
  return clearCookie(TEACHER_COOKIE);
}

/* ---------------- students ---------------- */

export async function startStudentSession(db: any, aliasId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  const expires = studentSessionExpiry(now);
  await db
    .prepare('INSERT INTO student_sessions (token_hash, alias_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256Hex(token), aliasId, now, expires)
    .run();
  return setCookie(STUDENT_COOKIE, token, (expires - now) / 1000);
}

export async function currentStudent(env: any, request: Request): Promise<Student | null> {
  const token = readCookie(request, STUDENT_COOKIE);
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    `SELECT a.id AS alias_id, a.alias, c.id AS class_id, c.name, c.period, t.board_code, t.sandbox
       FROM student_sessions s
       JOIN student_aliases a ON a.id = s.alias_id
       JOIN classes c ON c.id = a.class_id
       JOIN teachers t ON t.id = c.teacher_id
      WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND a.retired = 0 AND c.archived = 0`
  )
    .bind(await sha256Hex(token), Date.now())
    .first();
  if (!row) return null;
  return {
    aliasId: row.alias_id,
    alias: row.alias,
    classId: row.class_id,
    className: row.name,
    period: row.period,
    boardCode: row.board_code,
    test: !!row.sandbox
  };
}

export async function endStudentSession(db: any, request: Request): Promise<string> {
  const token = readCookie(request, STUDENT_COOKIE);
  if (token) await db.prepare('DELETE FROM student_sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
  return clearCookie(STUDENT_COOKIE);
}
