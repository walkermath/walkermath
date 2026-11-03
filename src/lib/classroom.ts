// src/lib/classroom.ts
// Class-level rules shared by the browser and the /api handlers: periods, bell times,
// class passcodes and student PINs. No storage, no network.

import { NOUNS, TAILS } from './pseudonym.ts';

/** Same period codes the leaderboard uses. */
export const PERIODS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const;
export type Period = (typeof PERIODS)[number];

export const isPeriod = (v: unknown): v is Period =>
  typeof v === 'string' && (PERIODS as readonly string[]).includes(v);

/** 'HH:MM', 24-hour. */
export const isBellTime = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const CLASS_NAME_MAX = 60;

/** Trim, collapse whitespace, drop control characters; '' if nothing usable is left. */
export function cleanClassName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CLASS_NAME_MAX);
}

/* ---------------- class passcodes ---------------- */

// Class codes are one of the alias nouns plus a 2-digit number, written on the board as e.g.
// "FOX42" (80 nouns x 86 numbers = 6,880 codes; more words or a third digit can be added later).
// The code is a shared gate for a class, not a personal secret: each student's PIN is what
// protects their alias. Codes issued before Nov 2026 look like "SLOPE-318" and keep working.

function randInt(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

/** e.g. 'FOX42'. Same noun list and number rules as aliases (no 69, 14, 18, 88). */
export function generatePasscode(): string {
  return `${NOUNS[randInt(NOUNS.length)].toUpperCase()}${TAILS[randInt(TAILS.length)]}`;
}

/**
 * Accepts 'fox 42', 'Fox-42', ' FOX42 ' and returns 'FOX42'; an older 3-digit code such as
 * 'slope 318' returns 'SLOPE-318'. '' if not a class-code shape.
 */
export function normalizePasscode(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = v.toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{2,8})-?(\d{2,3})$/);
  if (!m) return '';
  return m[2].length === 3 ? `${m[1]}-${m[2]}` : `${m[1]}${m[2]}`;
}

/* ---------------- student PINs ---------------- */

export const PIN_LENGTH = 6;

export function generatePin(): string {
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i++) pin += String(randInt(10));
  return pin;
}

export const isPinShape = (v: unknown): v is string =>
  typeof v === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(v);

/** Aliases are typed off a card: ignore case and spaces. */
export const normalizeAliasInput = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, '').toLowerCase().slice(0, 32) : '';

/**
 * The same typed alias with a misread 2-digit tail fixed ("vectorfox4o" -> "vectorfox40",
 * "vectorfoxl7" -> "vectorfox17"), or null when there's nothing to fix. Sign-in tries both, so an
 * older alias whose 4-character tail really ends in an L still matches as typed.
 */
export function aliasTailVariant(lower: string): string | null {
  const m = /^([a-z]+)([0-9oil]{2})$/.exec(lower);
  if (!m || !/[oil]/.test(m[2])) return null;
  return m[1] + m[2].replace(/o/g, '0').replace(/[il]/g, '1');
}
