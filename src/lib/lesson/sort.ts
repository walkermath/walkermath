// src/lib/lesson/sort.ts
// Card sort questions: students put each card into one of the teacher's groups ("linear" /
// "quadratic" / "neither"). Matching is the same thing with one card per group. Pure functions,
// used by the editor, the student view, marking and reports.
//
// Where things live, so keys never reach students:
//   question.sort    the groups and the cards, in the order the teacher wrote them
//   question.answer  the key: a JSON list with each card's group number as text ('0', '1', ...),
//                    '' for a card with no key. Private, like every other answer key.
//   a student's answer: a JSON list in card order, each the group number they chose or '';
//                    '' when no card has been placed.

import { joinList, parseList } from './grid.ts';

export interface SortSpec {
  groups: string[];
  cards: string[];
}

export const SORT_LIMITS = { groups: 6, cards: 16, group: 60, card: 120 } as const;

export function newSort(): SortSpec {
  return { groups: ['Linear', 'Not linear'], cards: ['$y = 3x + 1$', '$y = x^2$', '$y = -2x$', '$y = 2^x$'] };
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

const isIndex = (v: string, n: number) => /^\d{1,2}$/.test(v) && Number(v) < n;

/** The groups, cards and key as saved, or an error message. */
export function cleanSort(raw: any, answer: unknown): { sort: SortSpec; answer: string } | string {
  const groups = (Array.isArray(raw?.groups) ? raw.groups : []).map((g: unknown) => clean(g, SORT_LIMITS.group));
  const cards = (Array.isArray(raw?.cards) ? raw.cards : []).map((c: unknown) => clean(c, SORT_LIMITS.card));
  if (groups.length < 2 || groups.length > SORT_LIMITS.groups) return `a card sort needs 2 to ${SORT_LIMITS.groups} groups.`;
  if (cards.length < 2 || cards.length > SORT_LIMITS.cards) return `a card sort needs 2 to ${SORT_LIMITS.cards} cards.`;
  if (groups.some((g: string) => !g)) return 'every group needs a name.';
  if (cards.some((c: string) => !c)) return 'every card needs some text.';
  const keys = parseList(answer).slice(0, cards.length).map((k) => (isIndex(k, groups.length) ? k : ''));
  while (keys.length < cards.length) keys.push('');
  return { sort: { groups, cards }, answer: joinList(keys) };
}

/** A student's placements, checked: a JSON list of group numbers (or ''), at most one per card. */
export function cleanSortAnswer(v: string, spec: SortSpec | undefined): string | null {
  if (v === '') return '';
  let list: unknown;
  try {
    list = JSON.parse(v);
  } catch {
    return null;
  }
  if (!spec || !Array.isArray(list) || list.length > spec.cards.length) return null;
  if (!list.every((x) => x === '' || (typeof x === 'string' && isIndex(x, spec.groups.length)))) return null;
  return joinList(list as string[]);
}

/** Each card: in the right group, the wrong one, or not marked (no key, or not placed). */
export function sortMarks(keysJson: string, answerJson: string | undefined): (boolean | null)[] {
  const keys = parseList(keysJson);
  const vals = parseList(answerJson ?? '');
  return keys.map((k, i) => (!k || !vals[i] ? null : vals[i] === k));
}

/** The whole question: right only when every keyed card is in its group. */
export function sortCorrect(keysJson: string, answerJson: string | undefined): boolean | null {
  const keys = parseList(keysJson);
  if (!keys.some(Boolean)) return null;
  const vals = parseList(answerJson ?? '');
  if (!vals.some(Boolean)) return null;
  return keys.every((k, i) => !k || vals[i] === k);
}

/** Placements as text: "y = 3x + 1 → Linear | y = x^2 → Not linear | y = 2^x → _". */
export function sortText(spec: SortSpec | undefined, json: string | undefined): string {
  const vals = parseList(json ?? '');
  if (!spec) return vals.join(' | ');
  const plain = (s: string) => s.replace(/\$/g, '');
  return spec.cards.map((c, i) => `${plain(c)} → ${vals[i] ? (spec.groups[Number(vals[i])] ?? '?') : '_'}`).join(' | ');
}
