-- Atomic stock movement primitive shared by all 6 mutation commands
-- (!masuk, !dijalan, !terima, !keluar, !koreksi, !batal).
--
-- Every call: row-locks the balance, computes the new ready/in-transit
-- quantities, rejects if either would go negative, writes the ledger row,
-- and updates the balance — all inside the caller's transaction. Batch
-- commands call this once per line item inside a single BEGIN/COMMIT so
-- one invalid line rolls back the whole batch.

CREATE SEQUENCE stock_movement_no_seq START 1;

CREATE OR REPLACE FUNCTION stock_movement_deltas(p_movement_type text, p_qty integer)
RETURNS TABLE(delta_ready integer, delta_transit integer)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_movement_type
    WHEN 'MASUK' THEN
      delta_ready := p_qty;
      delta_transit := 0;
    WHEN 'DI_JALAN' THEN
      delta_ready := 0;
      delta_transit := p_qty;
    WHEN 'TERIMA' THEN
      delta_ready := p_qty;
      delta_transit := -p_qty;
    WHEN 'KELUAR' THEN
      delta_ready := -p_qty;
      delta_transit := 0;
    WHEN 'KOREKSI' THEN
      -- p_qty is a signed delta for KOREKSI (positive or negative)
      delta_ready := p_qty;
      delta_transit := 0;
    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_MOVEMENT_TYPE: %', p_movement_type;
  END CASE;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION process_stock_movement(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_owner_id uuid,
  p_movement_type text,
  p_qty integer,
  p_reference text,
  p_reason text,
  p_performed_by uuid,
  p_group_id uuid,
  p_related_movement_id uuid,
  p_whatsapp_message_id text
)
RETURNS stock_movements
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance stock_balances%ROWTYPE;
  v_related stock_movements%ROWTYPE;
  v_delta_ready integer;
  v_delta_transit integer;
  v_new_ready integer;
  v_new_transit integer;
  v_effective_qty integer;
  v_movement stock_movements%ROWTYPE;
  v_movement_no text;
BEGIN
  IF p_movement_type NOT IN ('MASUK', 'DI_JALAN', 'TERIMA', 'KELUAR', 'KOREKSI', 'BATAL') THEN
    RAISE EXCEPTION 'UNSUPPORTED_MOVEMENT_TYPE: %', p_movement_type;
  END IF;

  IF p_movement_type = 'KOREKSI' AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'KOREKSI_REQUIRES_REASON';
  END IF;

  IF p_qty IS NULL OR (p_movement_type <> 'KOREKSI' AND p_qty <= 0) THEN
    RAISE EXCEPTION 'INVALID_QTY';
  END IF;

  -- Ensure the balance row exists, then lock it for the duration of this transaction.
  INSERT INTO stock_balances (product_id, warehouse_id, stock_owner_id)
  VALUES (p_product_id, p_warehouse_id, p_owner_id)
  ON CONFLICT (product_id, warehouse_id, stock_owner_id) DO NOTHING;

  SELECT * INTO v_balance
  FROM stock_balances
  WHERE product_id = p_product_id
    AND warehouse_id = p_warehouse_id
    AND stock_owner_id = p_owner_id
  FOR UPDATE;

  IF p_movement_type = 'BATAL' THEN
    IF p_related_movement_id IS NULL THEN
      RAISE EXCEPTION 'BATAL_REQUIRES_RELATED_MOVEMENT';
    END IF;

    SELECT * INTO v_related FROM stock_movements WHERE id = p_related_movement_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RELATED_MOVEMENT_NOT_FOUND';
    END IF;

    SELECT delta_ready, delta_transit INTO v_delta_ready, v_delta_transit
    FROM stock_movement_deltas(v_related.movement_type, v_related.qty);

    -- BATAL reverses the original movement's effect.
    v_delta_ready := -v_delta_ready;
    v_delta_transit := -v_delta_transit;
    v_effective_qty := v_related.qty;
  ELSE
    SELECT delta_ready, delta_transit INTO v_delta_ready, v_delta_transit
    FROM stock_movement_deltas(p_movement_type, p_qty);
    v_effective_qty := p_qty;
  END IF;

  v_new_ready := v_balance.qty_ready + v_delta_ready;
  v_new_transit := v_balance.qty_in_transit + v_delta_transit;

  IF v_new_ready < 0 OR v_new_transit < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK';
  END IF;

  UPDATE stock_balances
  SET qty_ready = v_new_ready,
      qty_in_transit = v_new_transit,
      updated_at = now()
  WHERE id = v_balance.id;

  v_movement_no := 'MV-' || lpad(nextval('stock_movement_no_seq')::text, 6, '0');

  INSERT INTO stock_movements (
    movement_no, movement_type, product_id, warehouse_id, stock_owner_id,
    qty, qty_ready_before, qty_ready_after, qty_in_transit_before, qty_in_transit_after,
    reference, reason, related_movement_id, performed_by, group_id, whatsapp_message_id
  ) VALUES (
    v_movement_no, p_movement_type, p_product_id, p_warehouse_id, p_owner_id,
    v_effective_qty, v_balance.qty_ready, v_new_ready, v_balance.qty_in_transit, v_new_transit,
    p_reference, p_reason, p_related_movement_id, p_performed_by, p_group_id, p_whatsapp_message_id
  )
  RETURNING * INTO v_movement;

  RETURN v_movement;
END;
$$;
