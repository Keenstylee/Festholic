ALTER TABLE users ADD COLUMN experience TEXT NOT NULL DEFAULT 'promoter'
  CHECK (experience IN ('promoter', 'attendee', 'media'));

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user
  ON password_reset_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_expiry
  ON password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS user_workspaces (
  user_id TEXT NOT NULL,
  experience TEXT NOT NULL
    CHECK (experience IN ('promoter', 'attendee', 'media')),
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, experience),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_workspaces_updated
  ON user_workspaces(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_expiry
  ON auth_rate_limits(expires_at);
