import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { getCommand } from '../../src/command-router/registry.js';
import { UserFacingError } from '../../src/shared/errors.js';
import type { HandlerContext } from '../../src/types/context.js';

const mockPool = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

const mockSessionService = vi.hoisted(() => ({
  createConfirmation: vi.fn(),
  getSession: vi.fn(),
  resolveByQuotedReply: vi.fn(),
  completeSession: vi.fn(),
  cancelSession: vi.fn(),
  attachAnchor: vi.fn(),
  sweepExpired: vi.fn(),
}));

vi.mock('../../src/persistence/db.js', () => ({ pool: mockPool }));
vi.mock('../../src/conversation-session/sessionService.real.js', () => ({
  createSessionService: () => mockSessionService,
}));

beforeAll(async () => {
  await import('../../src/chat-moderation-service/commands/clear.js');
});

beforeEach(() => {
  mockPool.query.mockClear();
  mockSessionService.createConfirmation.mockReset();
});

function baseCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    messageId: 'msg-1',
    chatId: 'chat-1',
    groupId: 'group-1',
    warehouseId: 'wh-1',
    senderJid: '628111@c.us',
    userId: 'user-1',
    role: 'admin',
    isOwner: false,
    quotedMessageId: null,
    sessionId: null,
    args: [],
    rawBody: '!clear bot',
    ...overrides,
  };
}

describe('!clear bot / !clear saya — immediate, audited, no confirmation', () => {
  it('logs an audit entry and confirms for "clear bot"', async () => {
    const def = getCommand('clear bot')!;
    const result = await def.handler(baseCtx({ role: 'user' }));

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(params).toContain('clear_bot');
    expect(result.text).toContain('Menghapus pesan bot');
  });

  it('logs an audit entry and confirms for "clear saya"', async () => {
    const def = getCommand('clear saya')!;
    const result = await def.handler(baseCtx({ role: 'user' }));

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('clear_saya');
    expect(result.text).toContain('Menghapus pesan Anda');
  });
});

describe('!clear recent <jumlah> — owner/admin only, requires confirmation', () => {
  it('rejects a missing or non-numeric argument', async () => {
    const def = getCommand('clear recent')!;
    await expect(def.handler(baseCtx({ args: [] }))).rejects.toThrow(UserFacingError);
    await expect(def.handler(baseCtx({ args: ['abc'] }))).rejects.toThrow(UserFacingError);
    await expect(def.handler(baseCtx({ args: ['0'] }))).rejects.toThrow(UserFacingError);
    await expect(def.handler(baseCtx({ args: ['-5'] }))).rejects.toThrow(UserFacingError);
  });

  it('rejects an argument above the maximum', async () => {
    const def = getCommand('clear recent')!;
    await expect(def.handler(baseCtx({ args: ['9999'] }))).rejects.toThrow(UserFacingError);
  });

  it('logs the request and creates a confirmation session for a valid argument', async () => {
    mockSessionService.createConfirmation.mockResolvedValueOnce({ sessionId: 'sess-1' });
    const def = getCommand('clear recent')!;

    const result = await def.handler(baseCtx({ args: ['20'] }));

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [, auditParams] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(auditParams).toContain('clear_recent_requested');

    expect(mockSessionService.createConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'clear_recent', limit: 20 }),
      }),
    );
    expect(result.pendingSessionId).toBe('sess-1');
    expect(result.text).toContain('!ya');
    expect(result.text).toContain('!cancel');
  });
});

describe('!clear all — disabled in MVP unless ENABLE_CLEAR_ALL=true', () => {
  it('is not registered at all under the default (false) env flag', () => {
    // vitest.config.ts does not set ENABLE_CLEAR_ALL, so env.ts defaults it
    // to false, and the module-load-time `if (env.ENABLE_CLEAR_ALL)` guard
    // in clear.ts never calls registerCommand for it.
    expect(getCommand('clear all')).toBeUndefined();
  });
});
