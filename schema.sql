-- schema.sql
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  class_period TEXT,
  teacher TEXT,
  school_year TEXT NOT NULL,
  score INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_player_challenge UNIQUE (challenge_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_challenge_score 
ON leaderboard_entries(challenge_id, score DESC, duration_ms ASC);