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

describe('createSessionResolver', () => {
  it('returns null when the message is not a quoted reply', async () => {
    const resolveByQuotedReply = vi.fn();
    const resolver = createSessionResolver({ resolveByQuotedReply } as unknown as SessionService);

    const result = await resolver(baseMessage({ quotedMessageId: null }), grantedAccess);

    expect(result).toBeNull();
    expect(resolveByQuotedReply).not.toHaveBeenCalled();
  });

  it('returns null when access was not granted, even if quoting a message', async () => {
    const resolveByQuotedReply = vi.fn();
    const resolver = createSessionResolver({ resolveByQuotedReply } as unknown as SessionService);

    const result = await resolver(baseMessage({ quotedMessageId: 'anchor-1' }), { granted: false });

    expect(result).toBeNull();
    expect(resolveByQuotedReply).not.toHaveBeenCalled();
  });

  it('resolves the session id via resolveByQuotedReply scoped to the granted user and group', async () => {
    const resolveByQuotedReply = vi.fn(async () => ({ id: 'session-42' }));
    const resolver = createSessionResolver({ resolveByQuotedReply } as unknown as SessionService);

    const result = await resolver(baseMessage({ quotedMessageId: 'anchor-1' }), grantedAccess);

    expect(resolveByQuotedReply).toHaveBeenCalledWith('anchor-1', 'user-1', 'group-uuid-1');
    expect(result).toBe('session-42');
  });

  it('returns null when no active session matches the quoted reply', async () => {
    const resolveByQuotedReply = vi.fn(async () => null);
    const resolver = createSessionResolver({ resolveByQuotedReply } as unknown as SessionService);

    const result = await resolver(baseMessage({ quotedMessageId: 'anchor-1' }), grantedAccess);

    expect(result).toBeNull();
  });
});
