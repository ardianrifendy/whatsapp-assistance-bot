import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { UserFacingError } from '../../shared/errors.js';
import { sessionService } from '../deps.js';
import { findProductById } from '../productService.js';
import { findMovementByNo } from '../stockMovementService.js';
import { createStockMutationPreview } from '../previewService.js';
import type { StockMutationPayload } from '../previewService.js';

// !terima <nomor_transaksi> <jumlah>
//
// Ambiguity resolution (implementation.md canonical only lists
// "!terima <transaction_id>"): the DB function's TERIMA branch takes its
// own p_qty and moves that amount from Di Jalan to Ready in the pooled
// balance — it does NOT require the full quantity of the referenced
// DI_JALAN movement, and process_stock_movement enforces p_related_movement_id
// is optional for TERIMA. Partial receiving is explicitly supported per the
// task brief, which requires a qty the single canonical arg doesn't carry.
// We resolve this by requiring a second argument: the movement_no identifies
// WHICH in-transit batch/owner/product this receipt applies to (and is
// stored as related_movement_id for audit traceability), and the qty
// argument is the amount now being received — capped implicitly by
// INSUFFICIENT_STOCK if it exceeds the pooled in-transit balance.
registerCommand({
  name: 'terima',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: true,
  handler: async (ctx) => {
    const [movementNo, qtyRaw] = ctx.args;
    if (!movementNo || !qtyRaw) {
      throw new UserFacingError(
        'MISSING_ARG',
        'Gunakan format: !terima <nomor_transaksi> <jumlah>\nContoh: !terima MV-000042 5',
      );
    }
    if (!/^\d+$/.test(qtyRaw) || Number(qtyRaw) <= 0) {
      throw new UserFacingError('INVALID_QTY', 'Jumlah harus berupa bilangan bulat positif.');
    }
    const qty = Number(qtyRaw);

    const related = await findMovementByNo(pool, ctx.warehouseId, movementNo);
    if (!related) {
      throw new UserFacingError(
        'MOVEMENT_NOT_FOUND',
        `Transaksi "${movementNo}" tidak ditemukan di gudang ini.`,
      );
    }
    if (related.movementType !== 'DI_JALAN') {
      throw new UserFacingError(
        'INVALID_MOVEMENT_TYPE',
        `Transaksi "${movementNo}" bukan transaksi Di Jalan.`,
      );
    }

    const product = await findProductById(pool, related.productId);
    if (!product) {
      throw new UserFacingError('PRODUCT_NOT_FOUND', 'Produk terkait transaksi ini tidak ditemukan.');
    }

    const payload: StockMutationPayload = {
      type: 'stock_mutation',
      movementType: 'TERIMA',
      reference: related.reference,
      reason: null,
      lines: [
        {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          unit: product.unit,
          qty,
          ownerId: related.stockOwnerId,
          relatedMovementId: related.id,
        },
      ],
    };

    return createStockMutationPreview(sessionService, ctx, payload);
  },
});
