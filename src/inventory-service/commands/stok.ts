import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { UserFacingError } from '../../shared/errors.js';
import * as productService from '../productService.js';
import * as stockBalanceService from '../stockBalanceService.js';
import type { StockLine } from '../stockBalanceService.js';

function formatStockLines(lines: StockLine[]): string {
  if (lines.length === 0) return 'Tidak ada data stok.';
  return lines
    .map(
      (l) =>
        `${l.sku} - ${l.name}\n  Ready: ${l.qtyReady} ${l.unit} | Di Jalan: ${l.qtyInTransit} ${l.unit} | Total: ${l.qtyTotal} ${l.unit} | Min: ${l.minStock} ${l.unit}`,
    )
    .join('\n');
}

// Bare "!stok" is a convenience alias for "!stok saya" (the most common
// default lookup — a User checking their own holdings).
registerCommand({
  name: 'stok',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const lines = await stockBalanceService.getUserStock(pool, ctx.warehouseId, ctx.userId);
    return { text: `*Stok Saya*\n${formatStockLines(lines)}` };
  },
});

registerCommand({
  name: 'stok list',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const lines = await stockBalanceService.getWarehouseStockList(pool, ctx.warehouseId);
    return { text: `*Daftar Stok Gudang*\n${formatStockLines(lines)}` };
  },
});

registerCommand({
  name: 'stok saya',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const lines = await stockBalanceService.getUserStock(pool, ctx.warehouseId, ctx.userId);
    return { text: `*Stok Saya*\n${formatStockLines(lines)}` };
  },
});

registerCommand({
  name: 'stok user',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const identifier = ctx.args.join(' ').trim();
    if (!identifier) {
      throw new UserFacingError('MISSING_ARG', 'Gunakan format: !stok user <nama|nomor>');
    }
    const user = await stockBalanceService.resolveWarehouseUser(pool, ctx.warehouseId, identifier);
    if (!user) {
      throw new UserFacingError('USER_NOT_FOUND', `User "${identifier}" tidak ditemukan di gudang ini.`);
    }
    const lines = await stockBalanceService.getUserStock(pool, ctx.warehouseId, user.id);
    const label = user.displayName ?? user.whatsappNumber;
    return { text: `*Stok milik ${label}*\n${formatStockLines(lines)}` };
  },
});

registerCommand({
  name: 'stok sku',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const sku = ctx.args[0];
    if (!sku) {
      throw new UserFacingError('MISSING_ARG', 'Gunakan format: !stok sku <sku>');
    }
    const product = await productService.findProductBySku(pool, ctx.warehouseId, sku);
    if (!product) {
      throw new UserFacingError('PRODUCT_NOT_FOUND', `SKU "${sku}" tidak ditemukan di gudang ini.`);
    }
    const { total, owners } = await stockBalanceService.getProductStockBreakdown(pool, product);
    const ownerLines = owners
      .map((o) => `  - ${o.ownerName ?? o.ownerNumber}: Ready ${o.qtyReady} | Di Jalan ${o.qtyInTransit}`)
      .join('\n');
    return {
      text:
        `*${total.sku} - ${total.name}*\n` +
        `Ready: ${total.qtyReady} ${total.unit} | Di Jalan: ${total.qtyInTransit} ${total.unit} | Total: ${total.qtyTotal} ${total.unit} | Min: ${total.minStock} ${total.unit}` +
        (ownerLines ? `\n\nRincian per User:\n${ownerLines}` : ''),
    };
  },
});

registerCommand({
  name: 'stok cari',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const keyword = ctx.args.join(' ').trim();
    if (!keyword) {
      throw new UserFacingError('MISSING_ARG', 'Gunakan format: !stok cari <kata kunci>');
    }
    const lines = await stockBalanceService.searchStock(pool, ctx.warehouseId, keyword);
    return { text: `*Hasil pencarian "${keyword}"*\n${formatStockLines(lines)}` };
  },
});

registerCommand({
  name: 'stok menipis',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const lines = await stockBalanceService.getLowStockList(pool, ctx.warehouseId);
    if (lines.length === 0) {
      return { text: 'Tidak ada produk dengan stok menipis.' };
    }
    return { text: `*Stok Menipis*\n${formatStockLines(lines)}` };
  },
});
