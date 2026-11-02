-- Coliseum games played inside lessons.
-- Run once: SQLite can't re-run ALTER TABLE ADD COLUMN ("duplicate column name" = already applied).
--
-- Posting to the public leaderboard is off for every class until the teacher turns it on.
-- A student's public leaderboard name is generated separately from their lesson alias, so the
-- public board never shows lesson aliases. Only this database links the two.

ALTER TABLE classes ADD COLUMN leaderboard_posting INTEGER NOT NULL DEFAULT 0;

ALTER TABLE student_aliases ADD COLUMN board_name TEXT;                          -- e.g. 'PrismOtterK7M2'
ALTER TABLE student_aliases ADD COLUMN board_name_fixed INTEGER NOT NULL DEFAULT 0; -- 1 once a score was posted under it
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_aliases_board_name ON student_aliases (board_name);

-- Every lesson game result, posted or not. Only the teacher sees these (Phase 5 records).
CREATE TABLE IF NOT EXISTS lesson_scores (
  id          TEXT PRIMARY KEY,
  alias_id    TEXT NOT NULL REFERENCES student_aliases(id) ON DELETE CASCADE,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  game        TEXT NOT NULL,
  event       TEXT NOT NULL,
  level       INTEGER NOT NULL DEFAULT 0,
  variant     TEXT NOT NULL DEFAULT '',
  score       INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  posted      INTEGER NOT NULL DEFAULT 0,  -- 1 = also sent to the public leaderboard
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lesson_scores_class ON lesson_scores (class_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lesson_scores_alias ON lesson_scores (alias_id, created_at);
