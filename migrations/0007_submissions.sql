-- Phase 4b: what students hand in during a live lesson.
-- Run once: SQLite can't re-run ALTER TABLE ADD COLUMN ("duplicate column name" = already applied).
--
-- One row per student per module of a delivery. Answers save as the student types (a draft);
-- the module closing (moving on, or its time running out) is what makes them final; the room
-- refuses changes after that. Rows are keyed by alias only: no names.

CREATE TABLE IF NOT EXISTS submissions (
  run_id       TEXT NOT NULL REFERENCES lesson_runs(id) ON DELETE CASCADE,
  module_id    TEXT NOT NULL,                  -- the module's id in the run's snapshot
  alias_id     TEXT NOT NULL REFERENCES student_aliases(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL DEFAULT '{}',     -- { questionId: text } | { short: text } | { done: '1' }
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (run_id, module_id, alias_id)
);
CREATE INDEX IF NOT EXISTS idx_submissions_alias ON submissions (alias_id);

-- Coliseum games played inside a delivery: which run and module they belong to (null = before 4b).
ALTER TABLE lesson_scores ADD COLUMN run_id TEXT REFERENCES lesson_runs(id) ON DELETE SET NULL;
ALTER TABLE lesson_scores ADD COLUMN module_id TEXT;
CREATE INDEX IF NOT EXISTS idx_lesson_scores_run ON lesson_scores (run_id);

-- The room's final clock when a delivery ends (per-module time used), for records (Phase 5).
ALTER TABLE lesson_runs ADD COLUMN timing_json TEXT;
