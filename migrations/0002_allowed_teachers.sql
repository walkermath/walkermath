-- migrations/0002_allowed_teachers.sql
-- Who may sign in as a teacher. Replaces the TEACHER_ACCOUNTS setting so adding a teacher is a
-- click in /teach/teachers instead of a redeploy.
--
-- Apply once per database, after 0001:
--   local:      npx wrangler d1 execute walkermath-leaderboards --local  --file migrations/0002_allowed_teachers.sql
--   production: npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0002_allowed_teachers.sql
--
-- The ADMIN_EMAIL setting names the admin(s). An admin is always let in (a row is created for them
-- on first sign-in) and is the only one who can see and edit this list.

CREATE TABLE IF NOT EXISTS allowed_teachers (
  email      TEXT PRIMARY KEY,               -- lowercase, the Google account's email
  board_code TEXT NOT NULL,                  -- must be in src/lib/teachers.ts TEACHERS
  sandbox    INTEGER NOT NULL DEFAULT 0,     -- 1 = test account: its classes show a TEST banner
  note       TEXT NOT NULL DEFAULT '',       -- for the admin, e.g. "testing account"
  added_at   INTEGER NOT NULL
);
