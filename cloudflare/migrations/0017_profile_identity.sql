ALTER TABLE users ADD COLUMN pending_email TEXT COLLATE NOCASE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pending_email
  ON users(pending_email)
  WHERE pending_email IS NOT NULL;
