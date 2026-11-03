-- migrations/0010_student_notes.sql
-- Students' personal notes: a student can jot a note on any module of a lesson, during class or
-- afterwards, and find it again when they look back. Private to the student: the teacher's
-- screens and reports never read this table. One note per student per module of a delivery.
-- Safe to run twice.
--
--   local:      npx wrangler d1 execute walkermath-leaderboards --local  --file migrations/0010_student_notes.sql
--   production: npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0010_student_notes.sql

CREATE TABLE IF NOT EXISTS student_notes (
  run_id     TEXT NOT NULL REFERENCES lesson_runs(id) ON DELETE CASCADE,
  alias_id   TEXT NOT NULL REFERENCES student_aliases(id) ON DELETE CASCADE,
  module_id  TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, alias_id, module_id)
);
