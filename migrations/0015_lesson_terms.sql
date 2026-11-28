-- migrations/0015_lesson_terms.sql
-- A lesson's own tooltips: words the teacher marked with a short definition, shown to students as
-- a dotted underline with a tap-to-open popover. A JSON array of { id, term, also?, def }, saved
-- with the lesson (so they travel through the library, imports and exports).
-- Run once: SQLite can't add a column twice.
ALTER TABLE lessons ADD COLUMN terms_json TEXT NOT NULL DEFAULT '[]';
