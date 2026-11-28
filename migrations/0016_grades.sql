-- migrations/0016_grades.sql
-- Grades a person (or, later, the AI grader) gave: a long answer's points and comment, or an
-- override of an automatic ✓/✗ ("give credit"). One row per student, question and delivery.
-- Automatic grades are never stored: they're worked out from the delivery's frozen key and the
-- answer. A row always wins over the automatic grade. Students see rows only once the module is
-- released for that delivery (grade_releases). Deleted with the delivery or the student's alias.
-- Run once: the tables are created only if missing, so running it twice is harmless.
CREATE TABLE IF NOT EXISTS grades (
  run_id      TEXT NOT NULL REFERENCES lesson_runs(id) ON DELETE CASCADE,
  module_id   TEXT NOT NULL,                   -- the module's id in the run's snapshot
  alias_id    TEXT NOT NULL REFERENCES student_aliases(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  score       REAL NOT NULL,                   -- points given
  max         REAL NOT NULL,                   -- the question's points when graded
  comment     TEXT NOT NULL DEFAULT '',        -- plain text, at most 400 characters; shown to the student after release
  source      TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher', 'llm')),
  answer      TEXT NOT NULL DEFAULT '',        -- the answer as it was when graded
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (run_id, module_id, alias_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_grades_alias ON grades (alias_id);

-- "Release scores": one row per delivery and module. Grades given after release show right away.
CREATE TABLE IF NOT EXISTS grade_releases (
  run_id      TEXT NOT NULL REFERENCES lesson_runs(id) ON DELETE CASCADE,
  module_id   TEXT NOT NULL,
  released_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, module_id)
);
