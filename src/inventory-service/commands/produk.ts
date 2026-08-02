import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { withTransaction } from '../../persistence/transactions.js';
import { logAudit } from '../../audit-service/auditService.js';
import { UserFacingError } from '../../shared/errors.js';
import * as productService from '../productService.js';

/**
 * Assumption (feature.md / implementation.md don't spell out an inline
 * argument grammar for !produk tambah/ubah): fields are pipe-delimited on
 * the command line, mirroring the "SKU | qty" batch convention used
 * elsewhere. For !produk ubah, leave a segment empty to keep that field
 * unchanged.
 *   !produk tambah <SKU> | <Nama> | <Satuan> | <MinStok> | <alias1,alias2>
 *   !produk ubah <SKU> | <Nama> | <Satuan> | <MinStok> | <alias1,alias2>
 */
function parsePipeFields(raw: string): string[] {
  return raw.split('|').map((p) => p.trim());
}

function parseMinStock(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new UserFacingError('INVALID_MIN_STOCK', 'Minimum stok harus bilangan bulat >= 0.');
  }
  return value;
}

function parseAliases(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const aliases = raw
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  return aliases;
}

registerCommand({
  name: 'produk tambah',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const [skuPart, namePart, unitPart, minStockPart, aliasPart] = parsePipeFields(ctx.args.join(' '));
    if (!skuPart || !namePart) {
      throw new UserFacingError(
        'MISSING_ARG',
        'Gunakan format: !produk tambah <SKU> | <Nama> | <Satuan> | <MinStok> | <alias1,alias2>',
      );
    }

    const product = await withTransaction(async (client) => {
      const created = await productService.addProduct(client, {
        warehouseId: ctx.warehouseId,
        sku: skuPart,
        name: namePart,
        unit: unitPart || undefined,
        minStock: parseMinStock(minStockPart),
        aliases: parseAliases(aliasPart),
      });
      await logAudit(client, {
        action: 'product.tambah',
        targetType: 'product',
        targetId: created.id,
        performedBy: ctx.userId,
        groupId: ctx.groupId,
        warehouseId: ctx.warehouseId,
        afterData: created,
        whatsappMessageId: ctx.messageId,
      });
      return created;
    });

    return { text: `Produk "${product.sku}" - ${product.name} berhasil ditambahkan.` };
  },
});

registerCommand({
  name: 'produk ubah',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const sku = ctx.args[0];
    if (!sku) {
      throw new UserFacingError(
        'MISSING_ARG',
        'Gunakan format: !produk ubah <SKU> | <Nama> | <Satuan> | <MinStok> | <alias1,alias2>\nKosongkan bagian yang tidak ingin diubah.',
      );
    }
    const rest = ctx.args.slice(1).join(' ');
    const [namePart, unitPart, minStockPart, aliasPart] = parsePipeFields(rest);

    const patch: productService.UpdateProductInput = {};
    if (namePart) patch.name = namePart;
    if (unitPart) patch.unit = unitPart;
    const minStock = parseMinStock(minStockPart);
    if (minStock !== undefined) patch.minStock = minStock;
    const aliases = parseAliases(aliasPart);
    if (aliases !== undefined) patch.aliases = aliases;

    const { after } = await withTransaction(async (client) => {
      const updateResult = await productService.updateProduct(client, ctx.warehouseId, sku, patch);
      await logAudit(client, {
        action: 'product.ubah',
        targetType: 'product',
        targetId: updateResult.after.id,
        performedBy: ctx.userId,
        groupId: ctx.groupId,
        warehouseId: ctx.warehouseId,
        beforeData: updateResult.before,
        afterData: updateResult.after,
        whatsappMessageId: ctx.messageId,
      });
      return updateResult;
    });

    return { text: `Produk "${after.sku}" berhasil diperbarui.` };
  },
});

registerCommand({
  name: 'produk nonaktif',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const sku = ctx.args[0];
    if (!sku) {
      throw new UserFacingError('MISSING_ARG', 'Gunakan format: !produk nonaktif <sku>');
    }

    const { after } = await withTransaction(async (client) => {
      const result = await productService.deactivateProduct(client, ctx.warehouseId, sku);
      await logAudit(client, {
        action: 'product.nonaktif',
        targetType: 'product',
        targetId: result.after.id,
        performedBy: ctx.userId,
        groupId: ctx.groupId,
        warehouseId: ctx.warehouseId,
        beforeData: result.before,
        afterData: result.after,
        whatsappMessageId: ctx.messageId,
      });
      return result;
    });

    return { text: `Produk "${after.sku}" telah dinonaktifkan. Produk tetap muncul di riwayat.` };
  },
});

registerCommand({
  name: 'produk cari',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const keyword = ctx.args.join(' ').trim();
    if (!keyword) {
      throw new UserFacingError('MISSING_ARG', 'Gunakan format: !produk cari <kata kunci>');
    }
    const results = await productService.searchProducts(pool, ctx.warehouseId, keyword);
    if (results.length === 0) {
      return { text: `Tidak ada produk yang cocok dengan "${keyword}".` };
    }
    const lines = results.map((p) => `${p.sku} - ${p.name} (${p.unit})${p.isActive ? '' : ' [nonaktif]'}`);
    return { text: `*Hasil pencarian produk "${keyword}"*\n${lines.join('\n')}` };
  },
});

registerCommand({
  name: 'produk list',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const results = await productService.listProducts(pool, ctx.warehouseId, { activeOnly: true });
    if (results.length === 0) {
      return { text: 'Belum ada produk terdaftar di gudang ini.' };
    }
    const lines = results.map((p) => `${p.sku} - ${p.name} (${p.unit}) | Min: ${p.minStock}`);
    return { text: `*Daftar Produk*\n${lines.join('\n')}` };
  },
});
