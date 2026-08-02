import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { getWarehouseSummary } from '../stockBalanceService.js';

registerCommand({
  name: 'ringkasan',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const summary = await getWarehouseSummary(pool, ctx.warehouseId);
    return {
      text:
        `*Ringkasan Gudang*\n` +
        `Total produk aktif: ${summary.totalProducts}\n` +
        `Total Ready: ${summary.totalQtyReady}\n` +
        `Total Di Jalan: ${summary.totalQtyInTransit}\n` +
        `Produk stok menipis: ${summary.lowStockCount}`,
    };
  },
});
