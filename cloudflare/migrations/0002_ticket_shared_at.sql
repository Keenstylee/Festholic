ALTER TABLE tickets ADD COLUMN shared_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_tickets_shared_at
  ON tickets(shared_at);
