// src/lib/server/accounts.ts
// Who may sign in as a teacher.
//
//   * The allowed_teachers table (migrations/0002) lists every teacher account: email, leaderboard
//     board code and a sandbox flag. Admins edit it in /teach/teachers; no redeploy needed.
//   * The ADMIN_EMAIL setting (one email, or several separated by commas) names the admins. An admin
//     is always let in: their row is created on first sign-in if it's missing, and it can't be removed.
//   * Sandbox accounts can do everything, but their classes show a TEST banner to students.
//
// The list is checked on every request (sessions.ts and join.ts join against it), so removing a
// teacher signs them out everywhere and closes their classes to students at once.

import { TEACHERS, isKnownTeacher } from '../teachers.ts';

export interface TeacherAccount {
  email: string;
  boardCode: string;
  sandbox: boolean;
  note: string;
  addedAt: number;
}

export const MAX_ALLOWED_TEACHERS = 50;
export const NOTE_MAX = 80;

const toAccount = (r: any): TeacherAccount => ({
  email: r.email,
  boardCode: r.board_code,
  sandbox: !!r.sandbox,
  note: r.note ?? '',
  addedAt: r.added_at
});

/** Lowercased email if it looks like one, else ''. */
export function normalizeEmail(v: unknown): string {
  if (typeof v !== 'string') return '';
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/.test(e) ? e : '';
}

export function adminEmails(env: { ADMIN_EMAIL?: string }): Set<string> {
  return new Set(
    String(env.ADMIN_EMAIL || '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export const isAdmin = (env: { ADMIN_EMAIL?: string }, email: string): boolean =>
  adminEmails(env).has(String(email).toLowerCase());

export async function findAccount(db: any, email: string): Promise<TeacherAccount | null> {
  const row = await db.prepare('SELECT * FROM allowed_teachers WHERE email = ?1').bind(email).first();
  return row ? toAccount(row) : null;
}

/** The account for a Google sign-in, creating the admin's own row the first time. */
export async function accountForSignIn(env: any, email: string): Promise<TeacherAccount | null> {
  const found = await findAccount(env.DB, email);
  if (found || !isAdmin(env, email)) return found;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO allowed_teachers (email, board_code, sandbox, note, added_at) VALUES (?1, ?2, 0, ?3, ?4)'
  )
    .bind(email, TEACHERS[0], 'admin', Date.now())
    .run();
  return findAccount(env.DB, email);
}

export async function listAccounts(db: any): Promise<(TeacherAccount & { lastLoginAt: number | null })[]> {
  const { results } = await db
    .prepare(
      `SELECT a.*, (SELECT MAX(t.last_login_at) FROM teachers t WHERE t.email = a.email) AS last_login_at
         FROM allowed_teachers a ORDER BY a.email`
    )
    .all();
  return results.map((r: any) => ({ ...toAccount(r), lastLoginAt: r.last_login_at ?? null }));
}

export interface AccountInput {
  boardCode?: unknown;
  sandbox?: unknown;
  note?: unknown;
}

/** Validated fields to write, or an error message. */
export function cleanAccountInput(input: AccountInput): { boardCode?: string; sandbox?: boolean; note?: string } | string {
  const out: { boardCode?: string; sandbox?: boolean; note?: string } = {};
  if (input.boardCode !== undefined) {
    const code = String(input.boardCode).trim().toUpperCase();
    if (!isKnownTeacher(code)) return `Board code must be one of: ${TEACHERS.join(', ')}.`;
    out.boardCode = code;
  }
  if (input.sandbox !== undefined) out.sandbox = input.sandbox === true;
  if (input.note !== undefined) {
    out.note = String(input.note ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, NOTE_MAX);
  }
  return out;
}
