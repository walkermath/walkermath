// src/lib/questions/types.ts
// The shapes every question kind shares. See src/lib/questions/index.ts for the registry.

import type { Grid } from '../lesson/grid.ts';
import type { MathMatch } from '../lesson/mathcheck.ts';
import { MATH_MAX } from '../lesson/mathcheck.ts';
import type { SortSpec } from '../lesson/sort.ts';

export type QuestionKind = 'text' | 'number' | 'choice' | 'math' | 'grid' | 'sort';

export interface Question {
  id: string;
  kind: QuestionKind;
  text: string;
  /** Multiple choice only. */
  choices: string[];
  /** Optional answer key: text, a number as text, algebra as typed, or the correct choice's index as text. Private. */
  answer: string;
  /** Math and grid questions: 'form' = same form, any order (default); 'any' = any equivalent form. */
  match?: MathMatch;
  /** Grid questions: the table with its given cells and blanks (keys are in `answer`, see grid.ts). */
  grid?: Grid;
  /** Card sort questions: the groups and cards (the key, each card's group, is in `answer`; see sort.ts). */
  sort?: SortSpec;
  /** Grid and card sort questions: partial credit (the share of keyed cells / cards that are right). Off = all or nothing. */
  partial?: boolean;
  /** Number questions: the form answers must take. 'number' (default) or 'percent' (84.13 or 84.13%); only that form is accepted. */
  format?: 'number' | 'percent';
  /** Number questions: answers must be rounded to this many decimal places (0-6). Unset = exact. */
  decimals?: number;
  /** Multiple choice: students may pick more than one; right when they pick exactly the right set. */
  multi?: boolean;
  /** Short text: other answers that also count as right ("turning point" for "vertex"). Private, like the key. */
  alts?: string[];
}

/** Fields that are part of the key: moved to a module's private part and never sent to students. */
export const KEY_FIELDS = ['answer', 'alts'] as const;

/** The teacher's side: how long a question's parts may be. */
export const QUESTION_LIMITS = { text: 2000, choices: 6, choice: 200, answer: 200, alts: 5, decimals: 6 } as const;

/** The student's side: how long a typed answer may be. */
export const ANSWER_LIMITS = {
  text: 500,
  number: 40,
  math: MATH_MAX,
  short: 1000,
  keys: 50
} as const;

/**
 * The result of checking one answer.
 *   right / wrong   judged against the key
 *   partial         some of it right (Phase 4: grid cells, sort cards with partial credit on)
 *   blank           nothing to judge (no answer, or one that can't be read)
 *   unkeyed         the question has no key
 *   pending         waiting for a teacher or the long-answer grader (Phase 6+)
 * `score` out of `max` (1 for every automatic kind today). `parts`: per cell / card, where a kind has them.
 */
export interface Grade {
  status: 'right' | 'partial' | 'wrong' | 'blank' | 'unkeyed' | 'pending';
  score: number;
  max: number;
  parts?: (boolean | null)[];
  feedback?: string;
  source: 'auto' | 'teacher' | 'llm';
}

/**
 * A mark as students and the answers table see it: right (true), not right (false), not marked
 * (null), or partly right: the share right, between 0 and 1 (partial credit).
 */
export type QuestionMark = boolean | null | number;

/** What a kind's cleanQuestion gets besides the raw question. */
export interface CleanContext {
  /** "Bellwork" etc., for error messages. */
  where: string;
  /** 1-based, for error messages. */
  n: number;
  /** Active Feedback: no key and no matching rule are kept. */
  keyless: boolean;
}

/** One question kind, everything about it in one place. */
export interface QuestionKindDef {
  kind: QuestionKind;
  /** For the kind picker and the add buttons. */
  label: string;
  /** One line for the kind picker. */
  hint: string;
  /** Allowed in Active Feedback (teacher-marked, no key). */
  keyless: boolean;
  /** The kind's own fields for a new question (id, text and kind are added by the registry). */
  newQuestion(): Partial<Question>;
  /** The teacher's question and key, checked: the kind's own fields, or an error message. */
  cleanQuestion(raw: any, base: { text: string; answer: string }, ctx: CleanContext): Partial<Question> | string;
  /** A student's answer, checked: the cleaned text, or an error message ('' is never an error). */
  cleanAnswer(value: string, q: Question): string | { error: string };
  /** The answer against the key. The key is there (registry checks), and so is a non-blank answer. */
  grade(q: Question, answer: string): Grade;
  /** A stored answer as people read it ('1' -> 'B. x = 3'). Answer is non-blank. */
  answerText(q: Question, answer: string): string;
  /** The key as people read it ('' when there is none). */
  keyText(q: Question): string;
  /** Short labels for the question's card in the editor ("any equivalent form"). */
  tags(q: Question): string[];
}
