import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PoolClient } from 'pg';
import { pool } from '../../src/persistence/db.js';
import { withTransaction } from '../../src/persistence/transactions.js';
import { processMovement } from '../../src/inventory-service/stockMovementService.js';
import { InsufficientStockError } from '../../src/shared/errors.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeFakeClient() {
  const queryLog: string[] = [];
  let movementCallCount = 0;

  const client = {
    query: vi.fn(async (sql: string) => {
      const firstLine = sql.trim().split('\n')[0] ?? sql;
      queryLog.push(firstLine);

      if (firstLine === 'BEGIN' || firstLine === 'COMMIT' || firstLine === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('process_stock_movement')) {
        movementCallCount += 1;
        if (movementCallCount === 1) {
          return {
            rows: [
              {
                id: 'mv-1',
                movement_no: 'MV-000001',
                movement_type: 'MASUK',
                product_id: 'p1',
                warehouse_id: 'wh-1',
                stock_owner_id: 'u1',
                qty: 3,
                qty_ready_before: 0,
                qty_ready_after: 3,
                qty_in_transit_before: 0,
                qty_in_transit_after: 0,
                reference: 'PO-1',
                reason: null,
                related_movement_id: null,
                performed_by: 'u1',
                group_id: 'g1',
                whatsapp_message_id: 'm1',
                created_at: new Date(),
              },
            ],
            rowCount: 1,
          };
        }
        // Second line of the batch fails, mirroring Postgres's
        // RAISE EXCEPTION 'INSUFFICIENT_STOCK' from process_stock_movement().
        throw new Error('INSUFFICIENT_STOCK');
      }

      throw new Error(`unexpected query in test: ${sql}`);
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  return { client, queryLog };
}

describe('stock mutation batch — all-or-nothing', () => {
  it('rolls back the whole transaction when one line raises INSUFFICIENT_STOCK, reporting no partial success', async () => {
    const { client, queryLog } = makeFakeClient();
    vi.spyOn(pool, 'connect').mockImplementation((() => Promise.resolve(client)) as typeof pool.connect);

    const lines = [
      { productId: 'p1', sku: 'SKU-A', qty: 3 },
      { productId: 'p2', sku: 'SKU-B', qty: 999 },
    ];

    const run = withTransaction(async (txClient) => {
      const movementNos: string[] = [];
      for (const line of lines) {
        const movement = await processMovement(txClient, {
          productId: line.productId,
          warehouseId: 'wh-1',
          ownerId: 'u1',
          movementType: 'MASUK',
          qty: line.qty,
          reference: 'PO-1',
          reason: null,
          performedBy: 'u1',
          groupId: 'g1',
          relatedMovementId: null,
          whatsappMessageId: 'm1',
        });
        movementNos.push(movement.movementNo);
      }
      return movementNos;
    });

    await expect(run).rejects.toBeInstanceOf(InsufficientStockError);

    expect(queryLog).toContain('BEGIN');
    expect(queryLog).toContain('ROLLBACK');
    expect(queryLog).not.toContain('COMMIT');
    // Exactly two process_stock_movement attempts: line 1 succeeded inside
    // the (rolled-back) transaction, line 2 failed — no result was ever
    // reported back to the caller since the promise rejected.
    expect(client.query).toHaveBeenCalledTimes(4); // BEGIN, line1, line2 (throws), ROLLBACK
  });

  it('does not report success when the very first line fails', async () => {
    const { client, queryLog } = makeFakeClient();
    // Force failure on the first call by pre-bumping nothing — instead use
    // a qty that our fake still treats as "call #1 succeeds", so exercise
    // the single-line case via a fresh client whose first call fails.
    client.query = vi.fn(async (sql: string) => {
      const firstLine = sql.trim().split('\n')[0] ?? sql;
      queryLog.push(firstLine);
      if (firstLine === 'BEGIN' || firstLine === 'ROLLBACK' || firstLine === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }
      throw new Error('INSUFFICIENT_STOCK');
    }) as unknown as typeof client.query;

    vi.spyOn(pool, 'connect').mockImplementation((() => Promise.resolve(client)) as typeof pool.connect);

    const run = withTransaction(async (txClient) => {
      await processMovement(txClient, {
        productId: 'p1',
        warehouseId: 'wh-1',
        ownerId: 'u1',
        movementType: 'KELUAR',
        qty: 10,
        reference: null,
        reason: null,
        performedBy: 'u1',
        groupId: 'g1',
        relatedMovementId: null,
        whatsappMessageId: 'm2',
      });
      return 'should never get here';
    });

    await expect(run).rejects.toBeInstanceOf(InsufficientStockError);
    expect(queryLog).toContain('ROLLBACK');
    expect(queryLog).not.toContain('COMMIT');
  });
});
