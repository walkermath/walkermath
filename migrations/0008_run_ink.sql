-- Phase 4c: what the teacher wrote on each page during a delivery (blackboards and slides),
-- copied from the live room when the delivery ends. Lesson content, not student data.
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS run_ink (
  run_id       TEXT NOT NULL REFERENCES lesson_runs(id) ON DELETE CASCADE,
  page_id      TEXT NOT NULL,                  -- a slide's id, or a blackboard added in class (b-...)
  part         INTEGER NOT NULL DEFAULT 0,     -- a heavy page is split into parts, in order
  strokes_json TEXT NOT NULL,                  -- [{ id, c, w, p: [x0, y0, x1, y1, ...] }] on the 960 x 540 page
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (run_id, page_id, part)
);
