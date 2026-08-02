-- Bot Stok WhatsApp — core schema
-- Order resolves FK dependencies: warehouses -> bot_users -> bot_groups -> group_members
-- -> products -> stock_balances -> stock_movements -> stock_units
-- -> conversation_sessions -> processed_messages -> audit_logs

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- warehouses
-- ============================================================
CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- bot_users
-- ============================================================
CREATE TABLE bot_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- normalized WhatsApp number: digits only, no "+", no "@c.us" suffix
  whatsapp_number text NOT NULL UNIQUE,
  display_name text,
  is_owner boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bot_users_updated_at
  BEFORE UPDATE ON bot_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- bot_groups
-- ============================================================
CREATE TABLE bot_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_group_id text NOT NULL UNIQUE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  name text,
  is_active boolean NOT NULL DEFAULT true,
  registered_by uuid REFERENCES bot_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_groups_warehouse_id ON bot_groups(warehouse_id);

CREATE TRIGGER trg_bot_groups_updated_at
  BEFORE UPDATE ON bot_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- group_members
-- ============================================================
CREATE TABLE group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES bot_groups(id),
  user_id uuid NOT NULL REFERENCES bot_users(id),
  -- 'owner' is NOT a group_members role: ownership is global (bot_users.is_owner).
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_members_user_id ON group_members(user_id);

CREATE TRIGGER trg_group_members_updated_at
  BEFORE UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- products
-- ============================================================
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  sku text NOT NULL,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  unit text NOT NULL DEFAULT 'pcs',
  min_stock integer NOT NULL DEFAULT 0,
  -- MVP tracks quantity only; 'serial' is scaffolded, not enforced by any service yet.
  tracking_mode text NOT NULL DEFAULT 'quantity' CHECK (tracking_mode IN ('quantity', 'serial')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, sku)
);

CREATE INDEX idx_products_warehouse_id ON products(warehouse_id);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- stock_balances
-- ============================================================
CREATE TABLE stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  -- Every balance row always has an owner; there is no shared/unowned warehouse stock in MVP.
  stock_owner_id uuid NOT NULL REFERENCES bot_users(id),
  qty_ready integer NOT NULL DEFAULT 0 CHECK (qty_ready >= 0),
  qty_in_transit integer NOT NULL DEFAULT 0 CHECK (qty_in_transit >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse_id, stock_owner_id)
);

CREATE INDEX idx_stock_balances_owner ON stock_balances(stock_owner_id);
CREATE INDEX idx_stock_balances_warehouse ON stock_balances(warehouse_id);

CREATE TRIGGER trg_stock_balances_updated_at
  BEFORE UPDATE ON stock_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- stock_movements (ledger — never deleted)
-- ============================================================
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_no text NOT NULL UNIQUE,
  movement_type text NOT NULL CHECK (movement_type IN ('MASUK', 'DI_JALAN', 'TERIMA', 'KELUAR', 'KOREKSI', 'BATAL')),
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  stock_owner_id uuid NOT NULL REFERENCES bot_users(id),
  qty integer NOT NULL,
  qty_ready_before integer NOT NULL,
  qty_ready_after integer NOT NULL,
  qty_in_transit_before integer NOT NULL,
  qty_in_transit_after integer NOT NULL,
  reference text,
  -- required only for KOREKSI; enforced in process_stock_movement(), not by a CHECK,
  -- since the requirement is conditional on movement_type.
  reason text,
  related_movement_id uuid REFERENCES stock_movements(id),
  performed_by uuid NOT NULL REFERENCES bot_users(id),
  group_id uuid REFERENCES bot_groups(id),
  whatsapp_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_lookup ON stock_movements(product_id, warehouse_id, stock_owner_id);
CREATE INDEX idx_stock_movements_related ON stock_movements(related_movement_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);

-- ============================================================
-- stock_units (scaffold for serial/IMEI tracking — inactive in MVP)
-- ============================================================
CREATE TABLE stock_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  serial_number text NOT NULL,
  status text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'in_transit', 'out')),
  stock_owner_id uuid REFERENCES bot_users(id),
  warehouse_id uuid REFERENCES warehouses(id),
  movement_id uuid REFERENCES stock_movements(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, serial_number)
);

CREATE TRIGGER trg_stock_units_updated_at
  BEFORE UPDATE ON stock_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- conversation_sessions (help menu + pending confirmations)
-- ============================================================
CREATE TABLE conversation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type text NOT NULL CHECK (session_type IN ('help_menu', 'confirmation')),
  user_id uuid NOT NULL REFERENCES bot_users(id),
  group_id uuid NOT NULL REFERENCES bot_groups(id),
  chat_id text NOT NULL,
  -- the WhatsApp message ID of the bot's own message that a quoted reply must reference
  anchor_message_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed', 'cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_sessions_user_group ON conversation_sessions(user_id, group_id, status);
CREATE INDEX idx_conversation_sessions_anchor ON conversation_sessions(anchor_message_id);
CREATE INDEX idx_conversation_sessions_expires_at ON conversation_sessions(expires_at) WHERE status = 'active';

CREATE TRIGGER trg_conversation_sessions_updated_at
  BEFORE UPDATE ON conversation_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- processed_messages (idempotency backstop)
-- ============================================================
CREATE TABLE processed_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_message_id text NOT NULL UNIQUE,
  chat_id text,
  command text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- audit_logs
-- ============================================================
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target_type text,
  target_id text,
  performed_by uuid REFERENCES bot_users(id) ON DELETE SET NULL,
  group_id uuid REFERENCES bot_groups(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  before_data jsonb,
  after_data jsonb,
  whatsapp_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_performed_by ON audit_logs(performed_by);
