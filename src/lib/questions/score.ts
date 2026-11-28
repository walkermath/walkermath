// src/lib/questions/score.ts
// Points: the one place a module's questions are scored for a student. Reports, the student's past
// lesson, the to-grade list and the grading screen all call scoreModule, so their numbers can't
// disagree.
//
// Where a question's points come from, first match wins:
//   1. A stored grade (the grades table): a long answer graded by the teacher, or an override of an
//      automatic mark ("give credit"). Students only see these once the module is released, so
//      callers leave them out for students until then.
//   2. Active Feedback: the teacher's live mark (right = full points, partly right = half, not right yet = 0).
//   3. The automatic grade from the key (partial credit included).
// A long answer with no grade yet is "pending": it counts toward the total possible and earns 0 so far.
// A question with no key and nothing given is not counted at all.

import { gradeAnswer, pointsOf, type Grade, type Question } from './index.ts';

export type GradeSource = 'auto' | 'teacher' | 'llm' | 'feedback';

/** A stored grade, as the grading code reads it (the grades table). */
export interface StoredGrade {
  questionId: string;
  /** Points given. */
  score: number;
  /** The question's points when it was graded. */
  max: number;
  comment: string;
  source: 'teacher' | 'llm';
  /** The answer as it was when graded. */
  answer: string;
  at: number;
}

export interface QuestionScore {
  questionId: string;
  status: Grade['status'];
  /** Points earned (0 while pending). */
  points: number;
  /** What it's worth (0 when it isn't counted: no key and nothing given). */
  of: number;
  source: GradeSource;
  comment?: string;
  /** A stored grade replaced the automatic one. */
  overridden?: boolean;
  /** The automatic grade, where there is one (for the grading screen). */
  auto?: Grade['status'];
}

export interface ModuleScore {
  questions: QuestionScore[];
  total: number;
  max: number;
  /** Long answers with an answer and no grade yet. */
  pending: number;
}

const round = (n: number) => Math.round(n * 100) / 100;
const FEEDBACK_SHARE: Record<string, number> = { right: 1, partial: 0.5, wrong: 0 };

/** A share of the question's worth as a status: all of it right, none wrong, some partial. */
const statusOf = (share: number): Grade['status'] => (share >= 1 ? 'right' : share <= 0 ? 'wrong' : 'partial');

export function scoreQuestion(
  q: Question,
  answer: string | undefined,
  stored?: StoredGrade,
  feedbackMark?: 'right' | 'partial' | 'wrong' | null
): QuestionScore {
  const worth = pointsOf(q);
  const auto = gradeAnswer(q, answer);
  if (stored) {
    const share = stored.max > 0 ? Math.max(0, Math.min(1, stored.score / stored.max)) : 0;
    return {
      questionId: q.id,
      status: statusOf(share),
      points: round(share * worth),
      of: worth,
      source: stored.source,
      ...(stored.comment ? { comment: stored.comment } : {}),
      ...(auto.status !== 'pending' && auto.status !== 'blank' && auto.status !== 'unkeyed' ? { overridden: true, auto: auto.status } : {})
    };
  }
  if (feedbackMark && feedbackMark in FEEDBACK_SHARE) {
    const share = FEEDBACK_SHARE[feedbackMark];
    return { questionId: q.id, status: statusOf(share), points: round(share * worth), of: worth, source: 'feedback' };
  }
  if (auto.status === 'unkeyed') return { questionId: q.id, status: 'unkeyed', points: 0, of: 0, source: 'auto' };
  if (auto.status === 'blank') return { questionId: q.id, status: 'blank', points: 0, of: worth, source: 'auto' };
  if (auto.status === 'pending') return { questionId: q.id, status: 'pending', points: 0, of: worth, source: 'auto' };
  const share = auto.max > 0 ? auto.score / auto.max : 0;
  return { questionId: q.id, status: auto.status, points: round(share * worth), of: worth, source: 'auto', auto: auto.status };
}

/**
 * One student's score on one module. `grades` and `feedback` are that student's rows for this
 * module (by question id). Leave `grades` out for a student before the module is released.
 */
export function scoreModule(
  questions: Question[],
  answers: Record<string, string> | undefined,
  grades: Record<string, StoredGrade> = {},
  feedback: Record<string, 'right' | 'partial' | 'wrong' | null> = {}
): ModuleScore {
  const scored = questions.map((q) => scoreQuestion(q, answers?.[q.id], grades[q.id], feedback[q.id]));
  return {
    questions: scored,
    total: round(scored.reduce((n, s) => n + s.points, 0)),
    max: round(scored.reduce((n, s) => n + s.of, 0)),
    pending: scored.filter((s) => s.status === 'pending').length
  };
}

/** True when a module has anything a person grades (long answers), so it waits for release. */
export const isHandGraded = (questions: Question[]) => questions.some((q) => q.kind === 'long');
