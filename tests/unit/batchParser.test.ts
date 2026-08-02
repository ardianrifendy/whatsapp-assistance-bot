import { describe, it, expect } from 'vitest';
import { parseBatchLines } from '../../src/inventory-service/batchParser.js';
import { UserFacingError } from '../../src/shared/errors.js';

interface FakeProduct {
  id: string;
  sku: string;
}

function fakeLookup(existingSkus: string[]) {
  return async (sku: string): Promise<FakeProduct | null> =>
    existingSkus.includes(sku) ? { id: `id-${sku}`, sku } : null;
}

describe('parseBatchLines', () => {
  it('parses a valid batch into { sku, qty, product } lines', async () => {
    const result = await parseBatchLines(['SKU-A | 3', 'SKU-B | 5'], fakeLookup(['SKU-A', 'SKU-B']), 50);

    expect(result).toEqual([
      { sku: 'SKU-A', qty: 3, product: { id: 'id-SKU-A', sku: 'SKU-A' } },
      { sku: 'SKU-B', qty: 5, product: { id: 'id-SKU-B', sku: 'SKU-B' } },
    ]);
  });

  it('rejects a duplicate SKU within the same batch (case-insensitive)', async () => {
    await expect(
      parseBatchLines(['SKU-A | 1', 'sku-a | 2'], fakeLookup(['SKU-A']), 50),
    ).rejects.toThrow(UserFacingError);
  });

  it('rejects a batch exceeding the configured max item count', async () => {
    const lines = Array.from({ length: 5 }, (_, i) => `SKU-${i} | 1`);
    const existing = Array.from({ length: 5 }, (_, i) => `SKU-${i}`);

    await expect(parseBatchLines(lines, fakeLookup(existing), 3)).rejects.toThrow(UserFacingError);
  });

  it('rejects a non-positive quantity (zero or negative)', async () => {
    await expect(parseBatchLines(['SKU-A | 0'], fakeLookup(['SKU-A']), 50)).rejects.toThrow(
      UserFacingError,
    );
    await expect(parseBatchLines(['SKU-A | -5'], fakeLookup(['SKU-A']), 50)).rejects.toThrow(
      UserFacingError,
    );
  });

  it('rejects a non-integer quantity', async () => {
    await expect(parseBatchLines(['SKU-A | 1.5'], fakeLookup(['SKU-A']), 50)).rejects.toThrow(
      UserFacingError,
    );
  });

  it('rejects an empty or missing batch', async () => {
    await expect(parseBatchLines(undefined, fakeLookup([]), 50)).rejects.toThrow(UserFacingError);
    await expect(parseBatchLines([], fakeLookup([]), 50)).rejects.toThrow(UserFacingError);
  });

  it('rejects a line whose SKU is not found or not active for the warehouse', async () => {
    await expect(parseBatchLines(['SKU-X | 1'], fakeLookup(['SKU-A']), 50)).rejects.toThrow(
      UserFacingError,
    );
  });

  it('rejects a malformed line missing the pipe separator', async () => {
    await expect(parseBatchLines(['SKU-A 3'], fakeLookup(['SKU-A']), 50)).rejects.toThrow(
      UserFacingError,
    );
  });
});
