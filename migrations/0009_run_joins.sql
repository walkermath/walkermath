-- Phase 5a: when each student first joined a delivery (the reports' Joined column).
-- Written by the live room the first time an alias connects (socket or slow mode); one row per
-- student per delivery, never updated. Deliveries taught before this existed have no rows.
-- Safe to run twice.
--
--   local:      npx wrangler d1 execute walkermath-leaderboards --local  --file migrations/0009_run_joins.sql
--   production: npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0009_run_joins.sql

CREATE TABLE IF NOT EXISTS run_joins (
  run_id     TEXT NOT NULL REFERENCES lesson_runs(id) ON DELETE CASCADE,
  alias_id   TEXT NOT NULL REFERENCES student_aliases(id) ON DELETE CASCADE,
  joined_at  INTEGER NOT NULL,                   -- epoch ms, first connection
  PRIMARY KEY (run_id, alias_id)
);
