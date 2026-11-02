-- migrations/0004_lesson_topic.sql
-- Adds a "topic" to each lesson (e.g. "Solving two-step equations"), shown above the learning
-- objective in the builder and on the lessons list.
--
-- Apply once per database, after 0003 (SQLite can't add a column twice, so unlike the earlier
-- migrations this one is NOT safe to run again; if it says "duplicate column name", it's already done):
--   local:      npx wrangler d1 execute walkermath-leaderboards --local  --file migrations/0004_lesson_topic.sql
--   production: npx wrangler d1 execute walkermath-leaderboards --remote --file migrations/0004_lesson_topic.sql

ALTER TABLE lessons ADD COLUMN topic TEXT NOT NULL DEFAULT '';
