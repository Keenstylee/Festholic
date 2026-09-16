ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_files (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  file_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, scope, file_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_files_scope
  ON user_files(user_id, scope, updated_at DESC);
