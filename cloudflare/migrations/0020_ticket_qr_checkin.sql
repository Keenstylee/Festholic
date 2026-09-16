ALTER TABLE tickets ADD COLUMN checked_in_at INTEGER;
ALTER TABLE tickets ADD COLUMN source_platform TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_tickets_owner_event_code_value
  ON tickets(owner_id, event_id, code_value);

CREATE INDEX IF NOT EXISTS idx_tickets_owner_event_checkin
  ON tickets(owner_id, event_id, checked_in_at);
