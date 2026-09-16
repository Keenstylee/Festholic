CREATE TABLE IF NOT EXISTS security_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_security_audit_user_created
  ON security_audit(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_created
  ON security_audit(created_at DESC);
