import { UserFacingError } from '../shared/errors.js';
import { env } from '../config/env.js';

/**
 * Pure(-ish) parser for the "SKU | qty" batch line format shared by
 * !masuk / !dijalan / !keluar. The product-existence check is the only
 * part that needs I/O, so it's injected as `lookupProduct` — that keeps
 * this module unit-testable without a database and lets each caller
 * decide what "active for this warehouse" means (see productService.ts).
 */

export interface ParsedBatchLine<TProduct> {
  sku: string;
  qty: number;
  product: TProduct;
}

export type ProductLookup<TProduct> = (sku: string) => Promise<TProduct | null>;

export async function parseBatchLines<TProduct>(
  batchLines: string[] | undefined,
  lookupProduct: ProductLookup<TProduct>,
  maxItems: number = env.MAX_BATCH_ITEMS,
): Promise<Array<ParsedBatchLine<TProduct>>> {
  if (!batchLines || batchLines.length === 0) {
    throw new UserFacingError(
      'EMPTY_BATCH',
      'Tidak ada item pada batch. Tambahkan baris dengan format:\nSKU | jumlah',
    );
  }

  if (batchLines.length > maxItems) {
    throw new UserFacingError(
      'BATCH_TOO_LARGE',
      `Jumlah baris batch (${batchLines.length}) melebihi batas maksimum ${maxItems} item.`,
    );
  }

  const formatErrors: string[] = [];
  const seenSkus = new Set<string>();
  const candidates: Array<{ sku: string; qty: number }> = [];

  batchLines.forEach((line, index) => {
    const lineNo = index + 1;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      formatErrors.push(`Baris ${lineNo}: format tidak valid. Gunakan "SKU | jumlah".`);
      return;
    }
    const [skuRaw, qtyRaw] = parts as [string, string];
    const sku = skuRaw.toUpperCase();

    if (!/^-?\d+$/.test(qtyRaw)) {
      formatErrors.push(`Baris ${lineNo}: jumlah "${qtyRaw}" bukan bilangan bulat.`);
      return;
    }
    const qty = Number(qtyRaw);
    if (!Number.isInteger(qty) || qty <= 0) {
      formatErrors.push(`Baris ${lineNo}: jumlah harus bilangan bulat positif.`);
      return;
    }
    if (seenSkus.has(sku)) {
      formatErrors.push(`Baris ${lineNo}: SKU "${sku}" duplikat dalam batch ini.`);
      return;
    }
    seenSkus.add(sku);
    candidates.push({ sku, qty });
  });

  if (formatErrors.length > 0) {
    throw new UserFacingError('INVALID_BATCH', `Batch tidak valid:\n${formatErrors.join('\n')}`);
  }

  const lookupErrors: string[] = [];
  const result: Array<ParsedBatchLine<TProduct>> = [];
  for (const candidate of candidates) {
    const product = await lookupProduct(candidate.sku);
    if (!product) {
      lookupErrors.push(`SKU "${candidate.sku}" tidak ditemukan atau tidak aktif di gudang ini.`);
      continue;
    }
    result.push({ ...candidate, product });
  }

  if (lookupErrors.length > 0) {
    throw new UserFacingError('SKU_NOT_FOUND', `Batch tidak valid:\n${lookupErrors.join('\n')}`);
  }

  return result;
}
