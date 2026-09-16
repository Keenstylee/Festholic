CREATE TABLE IF NOT EXISTS promoter_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  category TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promoter_feedback_created
  ON promoter_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_promoter_feedback_user
  ON promoter_feedback(user_id, created_at DESC);
