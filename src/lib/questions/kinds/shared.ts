// src/lib/questions/kinds/shared.ts
// Helpers more than one kind uses.

import type { Grade } from '../types.ts';

/** right / wrong from a yes/no check; a check that can't decide (null) is "blank": nothing to judge. */
export function judged(ok: boolean | null, parts?: (boolean | null)[]): Grade {
  const base = { max: 1, source: 'auto' as const, ...(parts ? { parts } : {}) };
  if (ok === null) return { status: 'blank', score: 0, ...base };
  return { status: ok ? 'right' : 'wrong', score: ok ? 1 : 0, ...base };
}

/** Case and spacing don't matter: "X = 3" is "x = 3". */
export const normText = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

export const letter = (i: number) => String.fromCharCode(65 + i);
