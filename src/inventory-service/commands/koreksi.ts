import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { UserFacingError } from '../../shared/errors.js';
import { sessionService } from '../deps.js';
import { findActiveProductBySku } from '../productService.js';
import { createStockMutationPreview } from '../previewService.js';
import type { StockMutationPayload } from '../previewService.js';

// !koreksi <sku> <jumlah> <alasan>
// jumlah is a signed delta applied directly to qty_ready (can be negative).
// Assumption: the correction is applied to the performer's own stock
// (stock_owner_id = ctx.userId) — implementation.md doesn't name a target
// user for !koreksi, and Admin/Owner-only + mandatory reason are the only
// stated constraints.
registerCommand({
  name: 'koreksi',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: true,
  handler: async (ctx) => {
    const [sku, jumlahRaw, ...alasanParts] = ctx.args;
    const alasan = alasanParts.join(' ').trim();

    if (!sku || !jumlahRaw || !alasan) {
      throw new UserFacingError(
        'MISSING_ARG',
        'Gunakan format: !koreksi <sku> <jumlah> <alasan>\nJumlah boleh negatif, contoh: !koreksi POCO-F7 -2 barang rusak',
      );
    }
    if (!/^-?\d+$/.test(jumlahRaw)) {
      throw new UserFacingError('INVALID_QTY', 'Jumlah harus berupa bilangan bulat.');
    }
    const jumlah = Number(jumlahRaw);
    if (jumlah === 0) {
      throw new UserFacingError('INVALID_QTY', 'Jumlah koreksi tidak boleh nol.');
    }

    const product = await findActiveProductBySku(pool, ctx.warehouseId, sku);
    if (!product) {
      throw new UserFacingError(
        'PRODUCT_NOT_FOUND',
        `SKU "${sku}" tidak ditemukan atau tidak aktif di gudang ini.`,
      );
    }

    const payload: StockMutationPayload = {
      type: 'stock_mutation',
      movementType: 'KOREKSI',
      reference: null,
      reason: alasan,
      lines: [
        {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          unit: product.unit,
          qty: jumlah,
          ownerId: ctx.userId,
        },
      ],
    };

    return createStockMutationPreview(sessionService, ctx, payload);
  },
});
