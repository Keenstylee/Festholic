PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'promoter'
    CHECK (role IN ('owner', 'promoter')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE events ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'owner-keenscy';
ALTER TABLE tickets ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'owner-keenscy';
ALTER TABLE clients ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'owner-keenscy';
ALTER TABLE activity ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'owner-keenscy';
ALTER TABLE whatsapp_messages ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'owner-keenscy';

DROP INDEX IF EXISTS idx_clients_phone;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_owner_phone
  ON clients(owner_id, phone);
CREATE INDEX IF NOT EXISTS idx_events_owner_date
  ON events(owner_id, event_date, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_owner_event
  ON tickets(owner_id, event_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_owner_updated
  ON clients(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_owner_created
  ON activity(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_owner_sent
  ON whatsapp_messages(owner_id, sent_at DESC);

PRAGMA foreign_keys = ON;
