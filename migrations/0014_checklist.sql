-- migrations/0014_checklist.sql
-- The readiness checklist: up to 5 short items ("Have your journal out") a class's students check
-- off when they join a lesson. A JSON array of strings. Who has finished it is kept in the live
-- room only, never in the database.
ALTER TABLE classes ADD COLUMN checklist_json TEXT NOT NULL DEFAULT '[]';
