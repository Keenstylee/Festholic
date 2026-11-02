CREATE TABLE IF NOT EXISTS digitalizer_access (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  expires_at INTEGER,
  granted_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digitalizer_access_status
  ON digitalizer_access(status, expires_at);

CREATE TABLE IF NOT EXISTS digitalizer_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digitalizer_tokens_user
  ON digitalizer_tokens(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS digitalizer_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_count INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'single',
  event_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digitalizer_usage_user_created
  ON digitalizer_usage(user_id, created_at DESC);
