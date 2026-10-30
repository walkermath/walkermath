// src/lib/server/rateLimit.ts
// Fixed-window counters in D1 (table auth_attempts).
//
// Limits are deliberately generous per IP: a whole school shares one public IP, so 30 students
// joining at once must not trip it. The tight limit is per alias on wrong PINs.

import { hmacHex } from './crypto.ts';

export interface Limit {
  key: string;
  max: number;
  windowMs: number;
}

/** Current count in the window (0 if none or expired). */
export async function peek(db: any, { key, windowMs }: Limit): Promise<number> {
  const row = await db
    .prepare('SELECT count FROM auth_attempts WHERE key = ?1 AND window_start > ?2')
    .bind(key, Date.now() - windowMs)
    .first();
  return row ? Number(row.count) : 0;
}

/** Add one attempt; returns the new count. A stale window restarts at 1. */
export async function bump(db: any, { key, windowMs }: Limit): Promise<number> {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO auth_attempts (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count        = CASE WHEN auth_attempts.window_start <= ?3 THEN 1  ELSE auth_attempts.count + 1 END,
         window_start = CASE WHEN auth_attempts.window_start <= ?3 THEN ?2 ELSE auth_attempts.window_start END
       RETURNING count`
    )
    .bind(key, now, now - windowMs)
    .first();
  // Opportunistic cleanup, about 1 request in 50.
  if (Math.random() < 0.02) {
    await db.prepare('DELETE FROM auth_attempts WHERE window_start < ?1').bind(now - 24 * 60 * 60 * 1000).run();
  }
  return row ? Number(row.count) : 1;
}

export const reset = (db: any, { key }: Limit) =>
  db.prepare('DELETE FROM auth_attempts WHERE key = ?1').bind(key).run();

const TEN_MIN = 10 * 60 * 1000;

/** Join requests per (hashed) IP: high enough for a full class behind one school IP. */
export async function ipLimit(secret: string, ip: string): Promise<Limit> {
  return { key: `ip:${(await hmacHex(secret, `ip:${ip}`)).slice(0, 32)}`, max: 300, windowMs: TEN_MIN };
}

/** Wrong PINs per alias: 5 per 10 minutes, then wait. */
export const pinLimit = (aliasId: string): Limit => ({ key: `pin:${aliasId}`, max: 5, windowMs: TEN_MIN });
