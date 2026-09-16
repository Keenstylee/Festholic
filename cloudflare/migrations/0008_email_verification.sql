ALTER TABLE users ADD COLUMN email_verified_at INTEGER;

-- Las cuentas creadas antes de esta migracion conservan su acceso.
UPDATE users
SET email_verified_at = COALESCE(email_verified_at, updated_at, created_at);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user
  ON email_verification_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verification_expiry
  ON email_verification_tokens(expires_at);
