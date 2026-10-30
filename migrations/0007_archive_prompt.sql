-- The "/!\ archive?" prompt on [lessons]: shown once every delivery of a lesson is over.
-- [dismiss] stores when; the prompt comes back only after a later delivery finishes.
-- Run once: SQLite can't re-run ALTER TABLE ADD COLUMN ("duplicate column name" = already applied).
ALTER TABLE lessons ADD COLUMN archive_prompt_dismissed_at INTEGER;
