CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  profile_name TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'incoming'
    CHECK (direction IN ('incoming', 'outgoing')),
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL DEFAULT '',
  media_id TEXT,
  reply_to_message_id TEXT,
  sent_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_sent
  ON whatsapp_messages(phone, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_client_sent
  ON whatsapp_messages(client_id, sent_at DESC);
