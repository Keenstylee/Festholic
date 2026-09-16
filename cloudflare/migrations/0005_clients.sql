CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  event_id TEXT,
  stage TEXT NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new', 'info', 'pending', 'paid', 'delivered', 'inactive')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  interactions_json TEXT NOT NULL DEFAULT '[]',
  last_contact_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone
  ON clients(phone);

CREATE INDEX IF NOT EXISTS idx_clients_event_stage
  ON clients(event_id, stage);
