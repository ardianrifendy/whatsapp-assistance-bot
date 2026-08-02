import { describe, it, expect, afterEach, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { dispatch, type NormalizedIncomingMessage, type DispatchDeps } from '../../src/command-router/dispatch.js';
import { registerCommand, __resetRegistryForTests } from '../../src/command-router/registry.js';

afterEach(() => {
  __resetRegistryForTests();
});

function fakeClient(seen: Set<string>): PoolClient {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const messageId = params?.[0] as string;
      if (seen.has(messageId)) {
        return { rowCount: 0, rows: [] };
      }
      seen.add(messageId);
      return { rowCount: 1, rows: [{ id: 'row-1' }] };
    }),
  } as unknown as PoolClient;
}

function baseMessage(overrides: Partial<NormalizedIncomingMessage> = {}): NormalizedIncomingMessage {
  return {
    messageId: 'msg-1',
    chatId: 'chat-1',
    whatsappGroupId: 'group-1@g.us',
    senderJid: '628111@c.us',
    senderNumber: '628111',
    quotedMessageId: null,
    command: 'stok list',
    args: [],
    rawBody: '!stok list',
    ...overrides,
  };
}

const grantedAccess = {
  granted: true,
  userId: 'user-1',
  role: 'user' as const,
  isOwner: false,
  groupId: 'group-uuid-1',
  warehouseId: 'warehouse-uuid-1',
};

describe('dispatch', () => {
  it('drops messages that were not sent in a group', async () => {
    const seen = new Set<string>();
    const client = fakeClient(seen);
    const sendResponse = vi.fn();
    const sendError = vi.fn();
    const deps: DispatchDeps = {
      resolveAccess: vi.fn(),
      resolveSessionId: vi.fn(),
      sendResponse,
      sendError,
      attachAnchor: vi.fn(),
    };

    await dispatch(client, baseMessage({ whatsappGroupId: null }), deps);

    expect(sendResponse).not.toHaveBeenCalled();
    expect(sendError).not.toHaveBeenCalled();
    expect(deps.resolveAccess).not.toHaveBeenCalled();
  });

  it('skips a redelivered message id without re-running the handler', async () => {
    registerCommand({
      name: 'stok list',
      allowedRoles: 'any',
      requiresRegisteredGroup: true,
      requiresPreviewConfirm: false,
      handler: vi.fn(async () => ({ text: 'ok' })),
    });

    const seen = new Set<string>();
    const client = fakeClient(seen);
    const deps: DispatchDeps = {
      resolveAccess: vi.fn(async () => grantedAccess),
      resolveSessionId: vi.fn(async () => null),
      sendResponse: vi.fn(async () => ({ sentMessageId: 'sent-1' })),
      sendError: vi.fn(),
      attachAnchor: vi.fn(),
    };

    await dispatch(client, baseMessage(), deps);
    await dispatch(client, baseMessage(), deps);

    expect(deps.sendResponse).toHaveBeenCalledTimes(1);
  });

  it('replies with a friendly message for an unregistered command', async () => {
    const seen = new Set<string>();
    const client = fakeClient(seen);
    const sendError = vi.fn();
    const deps: DispatchDeps = {
      resolveAccess: vi.fn(),
      resolveSessionId: vi.fn(),
      sendResponse: vi.fn(),
      sendError,
      attachAnchor: vi.fn(),
    };

    await dispatch(client, baseMessage({ command: 'unknown cmd' }), deps);

    expect(sendError).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Perintah tidak dikenal'));
  });

  it('rejects when access is denied', async () => {
    registerCommand({
      name: 'stok list',
      allowedRoles: 'any',
      requiresRegisteredGroup: true,
      requiresPreviewConfirm: false,
      handler: vi.fn(async () => ({ text: 'ok' })),
    });

    const seen = new Set<string>();
    const client = fakeClient(seen);
    const sendError = vi.fn();
    const deps: DispatchDeps = {
      resolveAccess: vi.fn(async () => ({ granted: false, reason: 'Grup belum terdaftar.' })),
      resolveSessionId: vi.fn(),
      sendResponse: vi.fn(),
      sendError,
      attachAnchor: vi.fn(),
    };

    await dispatch(client, baseMessage(), deps);

    expect(sendError).toHaveBeenCalledWith(expect.anything(), 'Grup belum terdaftar.');
  });

  it('enforces the role allowlist', async () => {
    registerCommand({
      name: 'koreksi',
      allowedRoles: ['owner', 'admin'],
      requiresRegisteredGroup: true,
      requiresPreviewConfirm: true,
      handler: vi.fn(async () => ({ text: 'ok' })),
    });

    const seen = new Set<string>();
    const client = fakeClient(seen);
    const sendError = vi.fn();
    const deps: DispatchDeps = {
      resolveAccess: vi.fn(async () => grantedAccess), // role: 'user'
      resolveSessionId: vi.fn(async () => null),
      sendResponse: vi.fn(),
      sendError,
      attachAnchor: vi.fn(),
    };

    await dispatch(client, baseMessage({ command: 'koreksi' }), deps);

    expect(sendError).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('tidak memiliki akses'));
  });
});
