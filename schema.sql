-- schema.sql
-- Fresh-install schema. Existing databases get here by running migrations/0002_leaderboard_strata.sql.
--
-- One row per player per (game, event, level, variant): their best result in that stratum.
-- Nothing is pruned; the top 25 is applied only when a board is displayed, and the
-- "all settings" board is built at query time (see functions/api/leaderboard.js).
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  event TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  variant TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  class_period TEXT,
  teacher TEXT,
  school_year TEXT NOT NULL,
  score INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_player_stratum UNIQUE (game, event, level, variant, display_name)
);

CREATE INDEX IF NOT EXISTS idx_board_score ON leaderboard_entries (game, event, score DESC, duration_ms ASC);
CREATE INDEX IF NOT EXISTS idx_board_time  ON leaderboard_entries (game, event, duration_ms ASC, score DESC);