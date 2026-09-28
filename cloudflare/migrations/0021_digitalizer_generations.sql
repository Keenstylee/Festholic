CREATE TABLE IF NOT EXISTS digitalizer_generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_count INTEGER NOT NULL DEFAULT 1 CHECK (entry_count BETWEEN 1 AND 20),
  mode TEXT NOT NULL CHECK (mode IN ('single', 'batch')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digitalizer_generations_user_created
  ON digitalizer_generations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_digitalizer_generations_created
  ON digitalizer_generations(created_at DESC);
