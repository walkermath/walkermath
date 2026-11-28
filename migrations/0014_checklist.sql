-- migrations/0014_checklist.sql
-- The readiness checklist: up to 5 short items ("Have your journal out") students check off when
-- they join a lesson. It belongs to the lesson (so it travels with the lesson, the library and
-- exports). A JSON array of strings. Who has finished it is kept in the live room only, never in
-- the database.
-- Run once: SQLite can't add a column twice.
ALTER TABLE lessons ADD COLUMN checklist_json TEXT NOT NULL DEFAULT '[]';
