-- Lesson standards (e.g. TEKS codes) and the "Resources" links shown to students.
-- Run once: SQLite can't re-run ALTER TABLE ADD COLUMN.
ALTER TABLE lessons ADD COLUMN standards TEXT NOT NULL DEFAULT '';
ALTER TABLE lessons ADD COLUMN resources_json TEXT NOT NULL DEFAULT '[]';
