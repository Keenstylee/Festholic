PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_clients_owner_phone;
DROP INDEX IF EXISTS idx_clients_event_stage;
DROP INDEX IF EXISTS idx_clients_owner_updated;

CREATE TABLE clients_new (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  document TEXT NOT NULL DEFAULT '',
  event_id TEXT,
  stage TEXT NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new', 'info', 'pending', 'paid', 'delivery', 'delivered', 'inactive')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  interactions_json TEXT NOT NULL DEFAULT '[]',
  last_contact_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'owner-keenscy',
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

INSERT INTO clients_new (
  id, phone, name, document, event_id, stage, tags_json, notes,
  interactions_json, last_contact_at, created_at, updated_at, owner_id
)
SELECT
  id,
  phone,
  COALESCE(name, ''),
  COALESCE(document, ''),
  event_id,
  CASE stage
    WHEN 'delivery' THEN 'delivery'
    WHEN 'new' THEN 'new'
    WHEN 'info' THEN 'info'
    WHEN 'pending' THEN 'pending'
    WHEN 'paid' THEN 'paid'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'inactive' THEN 'inactive'
    ELSE 'new'
  END,
  COALESCE(tags_json, '[]'),
  COALESCE(notes, ''),
  COALESCE(interactions_json, '[]'),
  last_contact_at,
  created_at,
  updated_at,
  COALESCE(owner_id, 'owner-keenscy')
FROM clients;

DROP TABLE clients;
ALTER TABLE clients_new RENAME TO clients;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_owner_phone
  ON clients(owner_id, phone);
CREATE INDEX IF NOT EXISTS idx_clients_event_stage
  ON clients(event_id, stage);
CREATE INDEX IF NOT EXISTS idx_clients_owner_updated
  ON clients(owner_id, updated_at DESC);

PRAGMA foreign_keys = ON;
