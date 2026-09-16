PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  event_date TEXT,
  venue TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'cancelled')),
  image_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_events_status_date
  ON events(status, event_date);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  internal_code TEXT NOT NULL,
  format TEXT NOT NULL
    CHECK (format IN ('pdf', 'image', 'code', 'list')),
  zone TEXT NOT NULL DEFAULT 'General',
  base_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold', 'delivered', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
  payment_method TEXT NOT NULL DEFAULT '',
  buyer_name TEXT NOT NULL DEFAULT '',
  buyer_phone TEXT NOT NULL DEFAULT '',
  buyer_document TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  code_value TEXT NOT NULL DEFAULT '',
  object_key TEXT,
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE(event_id, internal_code)
);

CREATE INDEX IF NOT EXISTS idx_tickets_event_status
  ON tickets(event_id, status);

CREATE INDEX IF NOT EXISTS idx_tickets_buyer
  ON tickets(buyer_name, buyer_phone);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  entity_type TEXT,
  entity_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_created_at
  ON activity(created_at DESC);
