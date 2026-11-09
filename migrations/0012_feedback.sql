-- migrations/0012_feedback.sql
-- Active Feedback: the teacher's mark and message on one student's answer to one question of an
-- Active Feedback activity, during the lesson or after it. One row per student per question of a
-- delivery; a newer mark or message replaces the last, and clearing both removes the row.
-- Keyed by alias only (no names). Deleted with the delivery or the alias.
-- Safe to run twice.
--
--   local:      npx wrangler d1 execute walkermath-leaderboards --local  --file migrations/0012_feedback.sql
--   production: npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0012_feedback.sql

CREATE TABLE IF NOT EXISTS feedback (
  run_id      TEXT NOT NULL REFERENCES lesson_runs(id) ON DELETE CASCADE,
  module_id   TEXT NOT NULL,                   -- the module's id in the run's snapshot
  alias_id    TEXT NOT NULL REFERENCES student_aliases(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  mark        TEXT CHECK (mark IN ('right', 'partial', 'wrong')),  -- null: a message with no mark
  message     TEXT NOT NULL DEFAULT '',        -- plain text, at most 400 characters
  answer      TEXT NOT NULL DEFAULT '',        -- the answer as it was when marked ("revised" if it changes)
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (run_id, module_id, alias_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_alias ON feedback (alias_id);
