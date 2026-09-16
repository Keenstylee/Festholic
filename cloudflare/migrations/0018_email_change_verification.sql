CREATE TABLE IF NOT EXISTS email_change_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  new_email TEXT NOT NULL COLLATE NOCASE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_change_user
  ON email_change_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_change_expiry
  ON email_change_tokens(expires_at);
