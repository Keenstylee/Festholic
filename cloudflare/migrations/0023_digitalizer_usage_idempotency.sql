CREATE UNIQUE INDEX IF NOT EXISTS idx_digitalizer_usage_event_id
  ON digitalizer_usage(event_id)
  WHERE event_id <> '';
