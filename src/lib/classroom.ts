// src/lib/classroom.ts
// Class-level rules shared by the browser and the Pages Functions: periods, bell times,
// class passcodes and student PINs. No storage, no network.

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

// Short math words, written on the board as e.g. "TAPE-472". The passcode is a shared gate for a
// class, not a personal secret: each student's PIN is what protects their alias.
const PASSCODE_WORDS = [
  'ANGLE', 'AREA', 'AXIS', 'BASE', 'CHORD', 'CONE', 'CUBE', 'CURVE', 'DIGIT', 'EDGE',
  'FACE', 'GRAPH', 'GRID', 'HEXA', 'LIMIT', 'LINE', 'LOGIC', 'MEAN', 'MEDIAN', 'MODE',
  'NODE', 'ORBIT', 'PATH', 'PLANE', 'POINT', 'POWER', 'PRIME', 'PRISM', 'PROOF', 'RANGE',
  'RATIO', 'RAY', 'ROOT', 'SET', 'SIDE', 'SLOPE', 'SOLID', 'SPHERE', 'SQUARE', 'SUM',
  'TAPE', 'TERM', 'TILE', 'UNIT', 'VALUE', 'VERTEX', 'WIDTH', 'ZERO'
] as const;

function randInt(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

/** e.g. 'SLOPE-318' (48 words x 900 numbers). */
export function generatePasscode(): string {
  return `${PASSCODE_WORDS[randInt(PASSCODE_WORDS.length)]}-${100 + randInt(900)}`;
}

/** Accepts 'slope 318', 'Slope-318', ' SLOPE318 ' and returns 'SLOPE-318'; '' if not a passcode shape. */
export function normalizePasscode(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = v.toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{2,8})-?(\d{3})$/);
  return m ? `${m[1]}-${m[2]}` : '';
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
