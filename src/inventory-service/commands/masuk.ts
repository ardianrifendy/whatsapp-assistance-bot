import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { UserFacingError } from '../../shared/errors.js';
import { sessionService } from '../deps.js';
import { parseBatchLines } from '../batchParser.js';
import { findActiveProductBySku } from '../productService.js';
import { referenceAlreadyUsed } from '../stockMovementService.js';
import { createStockMutationPreview } from '../previewService.js';
import type { StockMutationPayload } from '../previewService.js';

// !masuk <referensi>
// SKU | jumlah
// SKU | jumlah
registerCommand({
  name: 'masuk',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: true,
  handler: async (ctx) => {
    const reference = ctx.args.join(' ').trim() || null;

    if (reference && (await referenceAlreadyUsed(pool, ctx.warehouseId, 'MASUK', reference))) {
      throw new UserFacingError(
        'DUPLICATE_REFERENCE',
        `Referensi "${reference}" sudah pernah diproses untuk transaksi Barang Masuk.`,
      );
    }

    const parsedLines = await parseBatchLines(ctx.batchLines, (sku) =>
      findActiveProductBySku(pool, ctx.warehouseId, sku),
    );

    const payload: StockMutationPayload = {
      type: 'stock_mutation',
      movementType: 'MASUK',
      reference,
      reason: null,
      lines: parsedLines.map((line) => ({
        productId: line.product.id,
        sku: line.product.sku,
        productName: line.product.name,
        unit: line.product.unit,
        qty: line.qty,
        ownerId: ctx.userId,
      })),
    };

    return createStockMutationPreview(sessionService, ctx, payload);
  },
});
