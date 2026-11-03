-- migrations/0011_library.sql
-- The lesson library: a teacher shares a copy of a lesson (answer keys and notes included) with the
-- other teachers on the allowlist, who can copy it into their own lessons. Only signed-in teachers
-- see it; students never do. The shared copy is fixed when shared: editing the lesson later doesn't
-- change it until the teacher shares again. Deleting the lesson removes it from the library.
-- Safe to run twice.
--
--   local:      npx wrangler d1 execute walkermath-leaderboards --local  --file migrations/0011_library.sql
--   production: npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0011_library.sql

CREATE TABLE IF NOT EXISTS library_lessons (
  id           TEXT PRIMARY KEY,
  lesson_id    TEXT NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  teacher_id   TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  topic        TEXT NOT NULL DEFAULT '',
  standards    TEXT NOT NULL DEFAULT '',
  module_count INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  lesson_json  TEXT NOT NULL,                  -- the lesson as shared: fields and modules, keys included
  copies       INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_updated ON library_lessons (updated_at);
