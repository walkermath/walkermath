// src/lib/server/join.ts
// Shared steps for the student join routes.

import { normalizePasscode } from '../classroom.ts';
import { clientIp, fail } from './http.ts';
import { bump, ipLimit } from './rateLimit.ts';
import { teacherAccounts } from './accounts.ts';

/** Count this request against the per-IP join limit; a Response means "stop, send this". */
export async function joinGate(env: any, request: Request): Promise<Response | null> {
  if (!env.AUTH_SECRET) return fail('Student sign-in is not set up yet.', 503);
  const limit = await ipLimit(env.AUTH_SECRET, clientIp(request));
  if ((await bump(env.DB, limit)) > limit.max) {
    return fail('Too many tries from this network. Wait a few minutes and try again.', 429);
  }
  return null;
}

export interface JoinClass {
  id: string;
  name: string;
  period: string;
  test: boolean;
}

/** Active class for a typed passcode, only if its teacher is still on the allowlist. */
export async function classForPasscode(env: any, passcode: unknown): Promise<JoinClass | null> {
  const code = normalizePasscode(passcode);
  if (!code) return null;
  const row = await env.DB.prepare(
    `SELECT c.id, c.name, c.period, t.email, t.sandbox
       FROM classes c JOIN teachers t ON t.id = c.teacher_id
      WHERE c.passcode = ?1 AND c.archived = 0`
  )
    .bind(code)
    .first();
  if (!row || !teacherAccounts(env).has(String(row.email).toLowerCase())) return null;
  return { id: row.id, name: row.name, period: row.period, test: !!row.sandbox };
}

export const WRONG_CODE = "That class code doesn't match a class. Check the board and try again.";
