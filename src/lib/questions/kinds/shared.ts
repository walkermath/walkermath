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

/**
 * Partial credit from per-part marks: the share of `counted` parts that are right (an empty part
 * counts as not right). `whole` is the all-or-nothing result, which always wins when it's right.
 */
export function partialGrade(whole: boolean | null, parts: (boolean | null)[], counted: number[]): Grade {
  if (whole === null) return judged(null, parts);
  if (whole || !counted.length) return judged(whole, parts);
  const right = counted.filter((i) => parts[i] === true).length;
  // Never full marks while the question as a whole isn't right (two grouped blanks with the same answer).
  const score = Math.min(right / counted.length, (counted.length - 1) / counted.length);
  if (score <= 0) return judged(false, parts);
  return { status: 'partial', score: Math.round(score * 1000) / 1000, max: 1, parts, source: 'auto' };
}

export const letter = (i: number) => String.fromCharCode(65 + i);
