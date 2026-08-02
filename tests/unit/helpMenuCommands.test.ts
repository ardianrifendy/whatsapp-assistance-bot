import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { getCommand } from '../../src/command-router/registry.js';
import type { HandlerContext } from '../../src/types/context.js';

const mockSessionService = vi.hoisted(() => ({
  createConfirmation: vi.fn(),
  getSession: vi.fn(),
  resolveByQuotedReply: vi.fn(),
  completeSession: vi.fn(),
  cancelSession: vi.fn(),
  attachAnchor: vi.fn(),
  sweepExpired: vi.fn(),
}));

vi.mock('../../src/conversation-session/sessionService.real.js', () => ({
  createSessionService: () => mockSessionService,
}));

vi.mock('../../src/persistence/db.js', () => ({ pool: {} }));

beforeAll(async () => {
  // Side-effecting import: registers help/menu/back/cancel/1..9 into the
  // shared registry exactly once for this test file's module graph.
  await import('../../src/help-service/commands/index.js');
});

beforeEach(() => {
  vi.resetAllMocks();
});

function baseCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
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
    rawBody: '!back',
    ...overrides,
  };
}

describe('!cancel — generic across help_menu and confirmation sessions', () => {
  it('tells the user there is nothing to cancel when ctx.sessionId is null', async () => {
    const def = getCommand('cancel')!;
    const result = await def.handler(baseCtx({ sessionId: null }));
    expect(result.text).toBe('Tidak ada sesi aktif untuk dibatalkan.');
    expect(mockSessionService.cancelSession).not.toHaveBeenCalled();
  });

  it('cancels an active session and confirms', async () => {
    mockSessionService.getSession.mockResolvedValueOnce({ id: 's1', status: 'active' });
    const def = getCommand('cancel')!;
    const result = await def.handler(baseCtx({ sessionId: 's1' }));
    expect(mockSessionService.cancelSession).toHaveBeenCalledWith('s1');
    expect(result.text).toBe('Sesi dibatalkan.');
  });

  it('does not call cancelSession again if the session already isnt active', async () => {
    mockSessionService.getSession.mockResolvedValueOnce({ id: 's1', status: 'expired' });
    const def = getCommand('cancel')!;
    const result = await def.handler(baseCtx({ sessionId: 's1' }));
    expect(mockSessionService.cancelSession).not.toHaveBeenCalled();
    expect(result.text).toBe('Tidak ada sesi aktif untuk dibatalkan.');
  });
});

describe('!back — help menu navigation', () => {
  it('pops the history stack and re-renders the previous topic as a new session', async () => {
    mockSessionService.getSession.mockResolvedValueOnce({
      id: 's1',
      status: 'active',
      sessionType: 'help_menu',
      payload: { kind: 'help_menu', topic: 'stok', history: ['main'] },
    });
    mockSessionService.createConfirmation.mockResolvedValueOnce({ sessionId: 's2' });

    const def = getCommand('back')!;
    const result = await def.handler(baseCtx({ sessionId: 's1', role: 'user' }));

    expect(mockSessionService.completeSession).toHaveBeenCalledWith('s1');
    expect(mockSessionService.createConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { kind: 'help_menu', topic: 'main', history: [] } }),
    );
    expect(result.pendingSessionId).toBe('s2');
  });

  it('says already at the main menu when the history stack is empty', async () => {
    mockSessionService.getSession.mockResolvedValueOnce({
      id: 's1',
      status: 'active',
      sessionType: 'help_menu',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
    });
    const def = getCommand('back')!;
    const result = await def.handler(baseCtx({ sessionId: 's1' }));
    expect(result.text).toContain('menu utama');
    expect(mockSessionService.completeSession).not.toHaveBeenCalled();
  });

  it('ignores a confirmation-type session — !back is help_menu-only', async () => {
    mockSessionService.getSession.mockResolvedValueOnce({
      id: 's1',
      status: 'active',
      sessionType: 'confirmation',
      payload: { movementType: 'MASUK' },
    });
    const def = getCommand('back')!;
    const result = await def.handler(baseCtx({ sessionId: 's1' }));
    expect(result.text).toContain('Ketik !help');
  });
});

describe('digit selection (!1 .. !9)', () => {
  it('digit "1" from the main menu advances to the stok submenu, pushing "main" onto history', async () => {
    mockSessionService.getSession.mockResolvedValueOnce({
      id: 's1',
      status: 'active',
      sessionType: 'help_menu',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
    });
    mockSessionService.createConfirmation.mockResolvedValueOnce({ sessionId: 's2' });

    const def = getCommand('1')!;
    const result = await def.handler(baseCtx({ sessionId: 's1', role: 'user' }));

    expect(mockSessionService.completeSession).toHaveBeenCalledWith('s1');
    expect(mockSessionService.createConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { kind: 'help_menu', topic: 'stok', history: ['main'] } }),
    );
    expect(result.pendingSessionId).toBe('s2');
  });

  it('digit "6" (admin) is not even offered to a user-role session, so it is rejected', async () => {
    mockSessionService.getSession.mockResolvedValueOnce({
      id: 's1',
      status: 'active',
      sessionType: 'help_menu',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
    });

    const def = getCommand('6')!;
    const result = await def.handler(baseCtx({ sessionId: 's1', role: 'user' }));

    expect(mockSessionService.createConfirmation).not.toHaveBeenCalled();
    expect(result.text).toContain('tidak tersedia');
  });

  it('digit "6" (admin) IS offered to an admin-role session and advances to the admin topic', async () => {
    mockSessionService.getSession.mockResolvedValueOnce({
      id: 's1',
      status: 'active',
      sessionType: 'help_menu',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
    });
    mockSessionService.createConfirmation.mockResolvedValueOnce({ sessionId: 's2' });

    const def = getCommand('6')!;
    const result = await def.handler(baseCtx({ sessionId: 's1', role: 'admin' }));

    expect(mockSessionService.createConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { kind: 'help_menu', topic: 'admin', history: ['main'] } }),
    );
    expect(result.pendingSessionId).toBe('s2');
  });

  it('falls back to "Ketik !help" when there is no active help_menu session for this reply', async () => {
    const def = getCommand('2')!;
    const result = await def.handler(baseCtx({ sessionId: null }));
    expect(result.text).toBe('Ketik !help untuk memulai.');
  });
});
