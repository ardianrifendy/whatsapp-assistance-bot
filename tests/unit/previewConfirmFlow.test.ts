import { describe, it, expect, vi } from 'vitest';
import {
  createStockMutationPreview,
  formatStockMutationPreview,
  isStockMutationPayload,
  type StockMutationPayload,
} from '../../src/inventory-service/previewService.js';
import type { SessionService } from '../../src/types/session.js';
import type { HandlerContext } from '../../src/types/context.js';

function fakeCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    messageId: 'msg-1',
    chatId: 'chat-1',
    groupId: 'group-1',
    warehouseId: 'wh-1',
    senderJid: '628111@c.us',
    userId: 'user-1',
    role: 'user',
    isOwner: false,
    quotedMessageId: null,
    sessionId: null,
    args: [],
    rawBody: '!masuk PO-1',
    ...overrides,
  };
}

function fakePayload(): StockMutationPayload {
  return {
    type: 'stock_mutation',
    movementType: 'MASUK',
    reference: 'PO-1',
    reason: null,
    lines: [
      { productId: 'prod-1', sku: 'SKU-A', productName: 'Product A', unit: 'pcs', qty: 3, ownerId: 'user-1' },
    ],
  };
}

describe('preview -> confirm flow', () => {
  it('formats a human-readable preview listing every line item and the confirm instructions', () => {
    const text = formatStockMutationPreview(fakePayload());

    expect(text).toContain('SKU-A');
    expect(text).toContain('Product A');
    expect(text).toContain('3');
    expect(text).toContain('PO-1');
  });

  it('opens a confirmation session and returns pendingSessionId + reply instructions, without touching balances', async () => {
    const createConfirmation = vi.fn().mockResolvedValue({ sessionId: 'sess-1' });
    const sessionService = {
      createConfirmation,
      getSession: vi.fn(),
      resolveByQuotedReply: vi.fn(),
      completeSession: vi.fn(),
      cancelSession: vi.fn(),
      attachAnchor: vi.fn(),
      sweepExpired: vi.fn(),
    } satisfies SessionService;

    const payload = fakePayload();
    const result = await createStockMutationPreview(sessionService, fakeCtx(), payload);

    expect(result.pendingSessionId).toBe('sess-1');
    expect(result.text).toContain('!ya');
    expect(result.text).toContain('!cancel');
    expect(createConfirmation).toHaveBeenCalledTimes(1);
    expect(createConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        groupId: 'group-1',
        chatId: 'chat-1',
        payload,
      }),
    );
  });

  it('validates the stored payload shape before the "!ya" handler trusts it', () => {
    expect(isStockMutationPayload(fakePayload())).toBe(true);
    expect(isStockMutationPayload({ type: 'something_else' })).toBe(false);
    expect(isStockMutationPayload(null)).toBe(false);
    expect(isStockMutationPayload({ type: 'stock_mutation', movementType: 'MASUK', lines: [{}] })).toBe(
      false,
    );
  });
});
