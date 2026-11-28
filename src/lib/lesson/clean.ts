// src/lib/lesson/clean.ts
// Small text cleaners shared by lesson validation (modules.ts) and the question registry
// (src/lib/questions/). Kept apart so the registry never has to import modules.ts.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const newUuid = () => crypto.randomUUID();

/** Single line: control characters removed, whitespace collapsed, trimmed, cut to `max`. */
export function cleanLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Multi-line text: keeps newlines and tabs, drops other control characters, trims the ends. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** A student's typed answer: control characters dropped, nothing else changed. */
export const stripControl = (v: string) => v.replace(CONTROL, '');
