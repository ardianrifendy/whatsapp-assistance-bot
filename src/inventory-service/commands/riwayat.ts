import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { getHistory } from '../stockMovementService.js';
import { formatJakarta } from '../../shared/time.js';

// !riwayat [sku]
registerCommand({
  name: 'riwayat',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const sku = ctx.args[0];
    const entries = await getHistory(pool, ctx.warehouseId, sku ? { sku } : {});
    if (entries.length === 0) {
      return { text: sku ? `Belum ada riwayat untuk SKU "${sku}".` : 'Belum ada riwayat transaksi.' };
    }
    const lines = entries.map((e) => {
      const sign = e.qty > 0 ? '+' : '';
      const who = e.performedByName ?? e.performedByNumber;
      const refPart = e.reference ? ` | Ref: ${e.reference}` : '';
      const reasonPart = e.reason ? ` | Alasan: ${e.reason}` : '';
      return (
        `${e.movementNo} [${e.movementType}] ${e.sku} - ${e.productName}: ${sign}${e.qty} ${e.unit}\n` +
        `  Ready akhir: ${e.qtyReadyAfter} | Di Jalan akhir: ${e.qtyInTransitAfter}\n` +
        `  Oleh: ${who} | ${formatJakarta(e.createdAt)}${refPart}${reasonPart}`
      );
    });
    return { text: `*Riwayat Transaksi*\n${lines.join('\n\n')}` };
  },
});
