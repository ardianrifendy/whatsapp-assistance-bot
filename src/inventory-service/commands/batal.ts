import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { UserFacingError } from '../../shared/errors.js';
import { sessionService } from '../deps.js';
import { findProductById } from '../productService.js';
import { findMovementByNo } from '../stockMovementService.js';
import { createStockMutationPreview } from '../previewService.js';
import type { StockMutationPayload } from '../previewService.js';

// !batal <nomor_transaksi>
//
// process_stock_movement's BATAL branch derives the reversal delta and
// effective qty from the referenced movement itself (v_related.movement_type,
// v_related.qty) — the p_qty we pass through is only used to satisfy the
// function's own "p_qty must be > 0 for non-KOREKSI types" validation, so we
// pass abs(original qty) (KOREKSI's qty can be negative) rather than the
// signed value.
registerCommand({
  name: 'batal',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: true,
  handler: async (ctx) => {
    const movementNo = ctx.args[0];
    if (!movementNo) {
      throw new UserFacingError('MISSING_ARG', 'Gunakan format: !batal <nomor_transaksi>');
    }

    const related = await findMovementByNo(pool, ctx.warehouseId, movementNo);
    if (!related) {
      throw new UserFacingError(
        'MOVEMENT_NOT_FOUND',
        `Transaksi "${movementNo}" tidak ditemukan di gudang ini.`,
      );
    }

    const product = await findProductById(pool, related.productId);
    if (!product) {
      throw new UserFacingError('PRODUCT_NOT_FOUND', 'Produk terkait transaksi ini tidak ditemukan.');
    }

    const payload: StockMutationPayload = {
      type: 'stock_mutation',
      movementType: 'BATAL',
      reference: related.reference,
      reason: `Pembatalan transaksi ${related.movementNo}`,
      lines: [
        {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          unit: product.unit,
          qty: Math.max(1, Math.abs(related.qty)),
          ownerId: related.stockOwnerId,
          relatedMovementId: related.id,
        },
      ],
    };

    return createStockMutationPreview(sessionService, ctx, payload);
  },
});
