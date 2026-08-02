import { describe, it, expect, vi } from 'vitest';
import { createSessionResolver } from '../../src/conversation-session/resolveSessionId.js';
import type { SessionService } from '../../src/types/session.js';
import type { NormalizedIncomingMessage, AccessResolution } from '../../src/command-router/dispatch.js';

function baseMessage(overrides: Partial<NormalizedIncomingMessage> = {}): NormalizedIncomingMessage {
  return {
    messageId: 'msg-1',
    chatId: 'chat-1',
    whatsappGroupId: 'group-1@g.us',
    senderJid: '628111@c.us',
    senderNumber: '628111',
    quotedMessageId: null,
    command: 'back',
    args: [],
    rawBody: '!back',
    ...overrides,
  };
}

const grantedAccess: AccessResolution = {
  granted: true,
  userId: 'user-1',
  role: 'user',
  isOwner: false,
  groupId: 'group-uuid-1',
  warehouseId: 'warehouse-uuid-1',
};

function fakeSessionService(overrides: Partial<SessionService> = {}): SessionService {
  return {
    resolveByQuotedReply: vi.fn(async () => null),
    getActiveSessionForUser: vi.fn(async () => null),
    ...overrides,
  } as unknown as SessionService;
}

describe('createSessionResolver', () => {
  it('returns null when access was not granted, even if quoting a message', async () => {
    const sessionService = fakeSessionService();
    const resolver = createSessionResolver(sessionService);

    const result = await resolver(baseMessage({ quotedMessageId: 'anchor-1' }), { granted: false });

    expect(result).toBeNull();
    expect(sessionService.resolveByQuotedReply).not.toHaveBeenCalled();
    expect(sessionService.getActiveSessionForUser).not.toHaveBeenCalled();
  });

  it('resolves the session id via resolveByQuotedReply scoped to the granted user and group', async () => {
    const resolveByQuotedReply = vi.fn(async () => ({ id: 'session-42' }));
    const sessionService = fakeSessionService({ resolveByQuotedReply } as unknown as Partial<SessionService>);
    const resolver = createSessionResolver(sessionService);

    const result = await resolver(baseMessage({ quotedMessageId: 'anchor-1' }), grantedAccess);

    expect(resolveByQuotedReply).toHaveBeenCalledWith('anchor-1', 'user-1', 'group-uuid-1');
    expect(result).toBe('session-42');
    expect(sessionService.getActiveSessionForUser).not.toHaveBeenCalled();
  });

  it('falls back to getActiveSessionForUser when there is no quoted reply at all', async () => {
    const getActiveSessionForUser = vi.fn(async () => ({ id: 'session-fallback' }));
    const sessionService = fakeSessionService({ getActiveSessionForUser } as unknown as Partial<SessionService>);
    const resolver = createSessionResolver(sessionService);

    const result = await resolver(baseMessage({ quotedMessageId: null }), grantedAccess);

    expect(sessionService.resolveByQuotedReply).not.toHaveBeenCalled();
    expect(getActiveSessionForUser).toHaveBeenCalledWith('user-1', 'group-uuid-1');
    expect(result).toBe('session-fallback');
  });

  it('falls back to getActiveSessionForUser when the quoted reply does not resolve', async () => {
    const getActiveSessionForUser = vi.fn(async () => ({ id: 'session-fallback' }));
    const sessionService = fakeSessionService({
      resolveByQuotedReply: vi.fn(async () => null),
      getActiveSessionForUser,
    } as unknown as Partial<SessionService>);
    const resolver = createSessionResolver(sessionService);

    const result = await resolver(baseMessage({ quotedMessageId: 'anchor-1' }), grantedAccess);

    expect(getActiveSessionForUser).toHaveBeenCalledWith('user-1', 'group-uuid-1');
    expect(result).toBe('session-fallback');
  });

  it('returns null when neither the quoted reply nor the fallback find an active session', async () => {
    const sessionService = fakeSessionService();
    const resolver = createSessionResolver(sessionService);

    const result = await resolver(baseMessage({ quotedMessageId: null }), grantedAccess);

    expect(result).toBeNull();
  });
});
