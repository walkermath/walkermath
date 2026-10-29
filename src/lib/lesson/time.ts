// src/lib/lesson/time.ts
// Time helpers shared by the browser and the Pages Functions. No dependencies: time zones go
// through Intl, which both browsers and the Workers runtime support.

export const STEP_SEC = 15;

/** 'YYYY-MM-DD' that is a real calendar date. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isTimeZone(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Milliseconds the zone is ahead of UTC at instant `ts` (e.g. -5 h for Chicago in summer). */
function zoneOffsetMs(ts: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(new Date(ts))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - (ts - (ts % 1000));
}

/** Wall-clock date + 'HH:MM' in `tz` -> epoch ms. */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffsetMs(guess, tz);
  // Re-check at the result so a daylight-saving change between guess and result is handled.
  return guess - zoneOffsetMs(first, tz);
}

/** epoch ms -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in `tz`. */
export function utcToZoned(ts: number, tz: string): { date: string; time: string } {
  const p: Record<string, string> = {};
  for (const part of partsFormatter(tz).formatToParts(new Date(ts))) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

/** 'HH:MM' -> minutes after midnight. */
export const clockMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 615 -> '10:15'; 3600 -> '60:00'. Negative values get a leading minus. */
export function mmss(totalSec: number): string {
  const sign = totalSec < 0 ? '-' : '';
  const s = Math.abs(Math.round(totalSec));
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** '10:15', '10', '10:5', '0:45' -> seconds; null if unreadable. Bare numbers are minutes. */
export function parseMmss(v: string): number | null {
  const t = String(v).trim();
  let m = t.match(/^(\d{1,3})$/);
  if (m) return Number(m[1]) * 60;
  m = t.match(/^(\d{1,3}):(\d{1,2})$/);
  if (m && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
  return null;
}

/** '13:22' -> '1:22 pm' */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Add seconds to 'HH:MM', wrapping at midnight. */
export function addToClock(hhmm: string, sec: number): string {
  const total = (((clockMinutes(hhmm) * 60 + sec) % 86400) + 86400) % 86400;
  const mins = Math.floor(total / 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
