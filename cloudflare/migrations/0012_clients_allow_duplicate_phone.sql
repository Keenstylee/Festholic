-- Permite que un mismo WhatsApp tenga varias reservas/entradas/clientes.
-- Antes era unico por owner_id + phone y eso rompia el sync completo cuando
-- se registraba otra reserva para el mismo número.
DROP INDEX IF EXISTS idx_clients_phone;
DROP INDEX IF EXISTS idx_clients_owner_phone;

CREATE INDEX IF NOT EXISTS idx_clients_owner_phone_lookup
  ON clients(owner_id, phone);

CREATE INDEX IF NOT EXISTS idx_clients_owner_event_lookup
  ON clients(owner_id, event_id);
