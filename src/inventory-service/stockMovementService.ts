import type { Pool, PoolClient } from 'pg';
import { UserFacingError, InsufficientStockError } from '../shared/errors.js';
import type { MovementType } from '../shared/constants.js';

type Queryable = Pool | PoolClient;

export interface ProcessMovementInput {
  productId: string;
  warehouseId: string;
  ownerId: string;
  movementType: MovementType;
  qty: number;
  reference: string | null;
  reason: string | null;
  performedBy: string;
  groupId: string;
  relatedMovementId: string | null;
  whatsappMessageId: string | null;
}

export interface StockMovementRecord {
  id: string;
  movementNo: string;
  movementType: MovementType;
  productId: string;
  warehouseId: string;
  stockOwnerId: string;
  qty: number;
  qtyReadyBefore: number;
  qtyReadyAfter: number;
  qtyInTransitBefore: number;
  qtyInTransitAfter: number;
  reference: string | null;
  reason: string | null;
  relatedMovementId: string | null;
  performedBy: string;
  groupId: string | null;
  whatsappMessageId: string | null;
  createdAt: Date;
}

interface MovementRow {
  id: string;
  movement_no: string;
  movement_type: string;
  product_id: string;
  warehouse_id: string;
  stock_owner_id: string;
  qty: number;
  qty_ready_before: number;
  qty_ready_after: number;
  qty_in_transit_before: number;
  qty_in_transit_after: number;
  reference: string | null;
  reason: string | null;
  related_movement_id: string | null;
  performed_by: string;
  group_id: string | null;
  whatsapp_message_id: string | null;
  created_at: Date;
}

function toRecord(row: MovementRow): StockMovementRecord {
  return {
    id: row.id,
    movementNo: row.movement_no,
    movementType: row.movement_type as MovementType,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    stockOwnerId: row.stock_owner_id,
    qty: row.qty,
    qtyReadyBefore: row.qty_ready_before,
    qtyReadyAfter: row.qty_ready_after,
    qtyInTransitBefore: row.qty_in_transit_before,
    qtyInTransitAfter: row.qty_in_transit_after,
    reference: row.reference,
    reason: row.reason,
    relatedMovementId: row.related_movement_id,
    performedBy: row.performed_by,
    groupId: row.group_id,
    whatsappMessageId: row.whatsapp_message_id,
    createdAt: row.created_at,
  };
}

function extractPgMessage(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    return typeof m === 'string' ? m : null;
  }
  return null;
}

/**
 * Maps the plain-text RAISE EXCEPTION codes used by process_stock_movement()
 * (migrations/0002_stock_movement_function.sql) to friendly UserFacingErrors.
 * Anything unrecognized is passed through unchanged so dispatch.ts's
 * catch-all can log it and reply with the generic failure message.
 */
function mapMovementError(err: unknown): Error {
  const message = extractPgMessage(err);
  if (!message) return err instanceof Error ? err : new Error(String(err));

  if (message.startsWith('INSUFFICIENT_STOCK')) {
    return new InsufficientStockError();
  }
  if (message.startsWith('KOREKSI_REQUIRES_REASON')) {
    return new UserFacingError('KOREKSI_REQUIRES_REASON', 'Alasan wajib diisi untuk transaksi koreksi.');
  }
  if (message.startsWith('BATAL_REQUIRES_RELATED_MOVEMENT')) {
    return new UserFacingError(
      'BATAL_REQUIRES_RELATED_MOVEMENT',
      'Pembatalan memerlukan nomor transaksi yang valid.',
    );
  }
  if (message.startsWith('RELATED_MOVEMENT_NOT_FOUND')) {
    return new UserFacingError(
      'RELATED_MOVEMENT_NOT_FOUND',
      'Transaksi yang ingin dibatalkan tidak ditemukan.',
    );
  }
  if (message.startsWith('INVALID_QTY')) {
    return new UserFacingError('INVALID_QTY', 'Jumlah tidak valid untuk transaksi ini.');
  }
  if (message.startsWith('UNSUPPORTED_MOVEMENT_TYPE')) {
    return new UserFacingError('UNSUPPORTED_MOVEMENT_TYPE', 'Jenis transaksi tidak didukung.');
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * The only place in inventory-service allowed to call process_stock_movement().
 * Always pass the transaction client from withTransaction() so a failure on
 * one batch line rolls back every line already applied in the same batch.
 */
export async function processMovement(
  client: PoolClient,
  input: ProcessMovementInput,
): Promise<StockMovementRecord> {
  try {
    const result = await client.query<MovementRow>(
      `SELECT * FROM process_stock_movement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        input.productId,
        input.warehouseId,
        input.ownerId,
        input.movementType,
        input.qty,
        input.reference,
        input.reason,
        input.performedBy,
        input.groupId,
        input.relatedMovementId,
        input.whatsappMessageId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('process_stock_movement returned no row');
    return toRecord(row);
  } catch (err) {
    throw mapMovementError(err);
  }
}

export async function findMovementByNo(
  db: Queryable,
  warehouseId: string,
  movementNo: string,
): Promise<StockMovementRecord | null> {
  const result = await db.query<MovementRow>(
    `SELECT * FROM stock_movements WHERE warehouse_id = $1 AND upper(movement_no) = upper($2)`,
    [warehouseId, movementNo],
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/** Guards "satu invoice/PO tidak boleh diproses dua kali" (implementation.md). */
export async function referenceAlreadyUsed(
  db: Queryable,
  warehouseId: string,
  movementType: MovementType,
  reference: string,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM stock_movements WHERE warehouse_id = $1 AND movement_type = $2 AND reference = $3 LIMIT 1`,
    [warehouseId, movementType, reference],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface HistoryEntry {
  movementNo: string;
  movementType: MovementType;
  sku: string;
  productName: string;
  unit: string;
  qty: number;
  qtyReadyAfter: number;
  qtyInTransitAfter: number;
  reference: string | null;
  reason: string | null;
  performedByName: string | null;
  performedByNumber: string;
  createdAt: Date;
}

interface HistoryRow {
  movement_no: string;
  movement_type: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  qty_ready_after: number;
  qty_in_transit_after: number;
  reference: string | null;
  reason: string | null;
  display_name: string | null;
  whatsapp_number: string;
  created_at: Date;
}

export async function getHistory(
  db: Queryable,
  warehouseId: string,
  opts: { sku?: string; limit?: number } = {},
): Promise<HistoryEntry[]> {
  const limit = opts.limit ?? 20;
  const params: unknown[] = [warehouseId];
  let skuClause = '';
  if (opts.sku) {
    params.push(opts.sku);
    skuClause = `AND upper(p.sku) = upper($${params.length})`;
  }
  params.push(limit);

  const result = await db.query<HistoryRow>(
    `SELECT sm.movement_no, sm.movement_type, p.sku, p.name, p.unit, sm.qty,
            sm.qty_ready_after, sm.qty_in_transit_after, sm.reference, sm.reason,
            bu.display_name, bu.whatsapp_number, sm.created_at
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     JOIN bot_users bu ON bu.id = sm.performed_by
     WHERE sm.warehouse_id = $1 ${skuClause}
     ORDER BY sm.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return result.rows.map((r) => ({
    movementNo: r.movement_no,
    movementType: r.movement_type as MovementType,
    sku: r.sku,
    productName: r.name,
    unit: r.unit,
    qty: r.qty,
    qtyReadyAfter: r.qty_ready_after,
    qtyInTransitAfter: r.qty_in_transit_after,
    reference: r.reference,
    reason: r.reason,
    performedByName: r.display_name,
    performedByNumber: r.whatsapp_number,
    createdAt: r.created_at,
  }));
}
