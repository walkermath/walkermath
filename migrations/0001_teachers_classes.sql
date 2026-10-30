-- migrations/0001_teachers_classes.sql
-- Lessons, Phase 2: teacher accounts (Google sign-in), classes, student aliases and sessions.
-- Leaves leaderboard_entries untouched.
--
-- Apply once per database:
--   local:      npx wrangler d1 execute walkermath-leaderboards --local  --file migrations/0001_teachers_classes.sql
--   production: npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0001_teachers_classes.sql
--
-- Times are Unix epoch milliseconds (UTC). IDs are random UUIDs.
-- No student names, emails or school IDs are stored anywhere in this database.

-- One row per signed-in teacher. Who may sign in is decided by allowed_teachers (migration 0002),
-- checked on every request, so removing an email there locks that account out immediately.
CREATE TABLE IF NOT EXISTS teachers (
  id            TEXT PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,          -- Google's stable account id
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  board_code    TEXT NOT NULL,                 -- must be in src/lib/teachers.ts TEACHERS
  sandbox       INTEGER NOT NULL DEFAULT 0,    -- 1 = test account: its classes show a TEST banner
  time_zone     TEXT NOT NULL DEFAULT 'America/Chicago',
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

-- Only the SHA-256 of the cookie token is stored.
CREATE TABLE IF NOT EXISTS teacher_sessions (
  token_hash TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teacher_sessions_teacher ON teacher_sessions (teacher_id);

-- A section, e.g. "Algebra II" in P3, with its default bell times.
CREATE TABLE IF NOT EXISTS classes (
  id         TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  period     TEXT NOT NULL,                    -- 'P0'..'P9', same codes as the leaderboard
  passcode   TEXT NOT NULL UNIQUE,             -- shared class code, e.g. 'TAPE-472'
  bell_start TEXT,                             -- 'HH:MM' in the teacher's time zone
  bell_end   TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes (teacher_id);

-- The persistent roster slots. The alias-to-student key is kept by the teacher, off this site.
-- Aliases are unique site-wide so a student's leaderboard record can never collide with another's.
CREATE TABLE IF NOT EXISTS student_aliases (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,                   -- from generateAlias(), e.g. 'VectorFoxK7M2'
  alias_lower TEXT NOT NULL UNIQUE,            -- for case-insensitive sign-in
  pin_hash    TEXT NOT NULL,                   -- HMAC-SHA256(AUTH_SECRET, id + PIN); PIN never stored
  retired     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_student_aliases_class ON student_aliases (class_id);

CREATE TABLE IF NOT EXISTS student_sessions (
  token_hash TEXT PRIMARY KEY,
  alias_id   TEXT NOT NULL REFERENCES student_aliases(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_student_sessions_alias ON student_sessions (alias_id);

-- Hook for student Google sign-in later. Ships empty. Stores only a keyed hash of the provider's
-- account id, never an email or name.
CREATE TABLE IF NOT EXISTS student_identities (
  provider     TEXT NOT NULL,
  subject_hmac TEXT NOT NULL,
  alias_id     TEXT NOT NULL REFERENCES student_aliases(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (provider, subject_hmac)
);

-- Sign-in rate limits. Keys are 'pin:<alias id>' or 'ip:<keyed hash of the IP>'; raw IPs are never
-- stored. Rows older than a day are deleted opportunistically.
CREATE TABLE IF NOT EXISTS auth_attempts (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
