-- migrations/0003_lessons.sql
-- Lessons, Phase 3: lesson designs, their module chains, and scheduled deliveries (runs).
-- Phase 4 adds the live clock and submissions on top of lesson_runs.
--
-- Apply once per database, after 0002:
--   local:      npx wrangler d1 execute walkermath-leaderboards --local  --file migrations/0003_lessons.sql
--   production: npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0003_lessons.sql
--
-- Times are Unix epoch milliseconds (UTC); durations are seconds. No student data in these tables.

-- A lesson design: the reusable template. Reused across periods and days.
CREATE TABLE IF NOT EXISTS lessons (
  id               TEXT PRIMARY KEY,
  teacher_id       TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  objective        TEXT NOT NULL DEFAULT '',
  success_criteria TEXT NOT NULL DEFAULT '',
  duration_sec     INTEGER NOT NULL,           -- planned lesson length
  archived         INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL            -- also the edit-conflict check between two tabs
);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons (teacher_id, archived, updated_at);

-- The chain of tiles. private_json holds answer keys and is never sent to students.
CREATE TABLE IF NOT EXISTS lesson_modules (
  id           TEXT PRIMARY KEY,
  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  type         TEXT NOT NULL,                  -- 'prompt' | 'notes' | 'activity' | 'independent'
  title        TEXT NOT NULL,
  planned_sec  INTEGER NOT NULL,
  pacing       TEXT NOT NULL DEFAULT 'flex',   -- 'flex' | 'locked'
  min_sec      INTEGER,                        -- floor for flex modules; NULL = half the plan
  on_time_up   TEXT NOT NULL DEFAULT 'auto',   -- 'auto' (advance) | 'hold'
  config_json  TEXT NOT NULL DEFAULT '{}',
  private_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_lesson_modules_lesson ON lesson_modules (lesson_id, position);

-- One delivery of a lesson to one class: each "repeat" row in the builder.
-- The wall-clock fields are what the teacher typed; scheduled_* are the same moments in UTC.
CREATE TABLE IF NOT EXISTS lesson_runs (
  id              TEXT PRIMARY KEY,
  lesson_id       TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  class_id        TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  run_date        TEXT NOT NULL,               -- 'YYYY-MM-DD'
  start_time      TEXT NOT NULL,               -- 'HH:MM'
  end_time        TEXT NOT NULL,               -- 'HH:MM' (the bell)
  time_zone       TEXT NOT NULL,
  scheduled_start INTEGER NOT NULL,
  scheduled_end   INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'live' | 'ended'
  started_at      INTEGER,
  ended_at        INTEGER,
  snapshot_json   TEXT,                        -- lesson + modules copied when the run goes live
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lesson_runs_lesson ON lesson_runs (lesson_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_lesson_runs_class ON lesson_runs (class_id, scheduled_start);
