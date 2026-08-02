import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { createSessionService, resolveSessionType } from '../../src/conversation-session/sessionService.real.js';

/**
 * In-memory fake standing in for `pg.Pool`, implementing just enough of the
 * fixed SQL statements sessionService.real.ts issues to exercise its real
 * control flow (expiry filtering, user/group scoping on quoted-reply
 * resolution, status transitions) without a live database.
 */
interface FakeRow {
  id: string;
  session_type: string;
  user_id: string;
  group_id: string;
  chat_id: string;
  anchor_message_id: string | null;
  payload: unknown;
  status: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

function makeFakePool() {
  const rows: FakeRow[] = [];
  let nextId = 1;

  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    if (text.includes('INSERT INTO conversation_sessions')) {
      const [sessionType, userId, groupId, chatId, anchorMessageId, payloadJson, expiresAt] = params as [
        string,
        string,
        string,
        string,
        string | null,
        string,
        Date,
      ];
      const row: FakeRow = {
        id: `row-${nextId++}`,
        session_type: sessionType,
        user_id: userId,
        group_id: groupId,
        chat_id: chatId,
        anchor_message_id: anchorMessageId,
        payload: JSON.parse(payloadJson),
        status: 'active',
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      };
      rows.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    if (text.includes('SELECT * FROM conversation_sessions WHERE id = $1')) {
      const [id] = params as [string];
      const row = rows.find((r) => r.id === id);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (text.includes('WHERE anchor_message_id')) {
      const [anchor, userId, groupId] = params as [string, string, string];
      const now = new Date();
      const match = rows.find(
        (r) =>
          r.anchor_message_id === anchor &&
          r.user_id === userId &&
          r.group_id === groupId &&
          r.status === 'active' &&
          r.expires_at.getTime() > now.getTime(),
      );
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }

    if (text.includes("SET status = 'completed'")) {
      const [id] = params as [string];
      const row = rows.find((r) => r.id === id && r.status === 'active');
      if (row) row.status = 'completed';
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    if (text.includes("SET status = 'cancelled'")) {
      const [id] = params as [string];
      const row = rows.find((r) => r.id === id && r.status === 'active');
      if (row) row.status = 'cancelled';
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    if (text.includes('SET anchor_message_id')) {
      const [anchorMessageId, id] = params as [string, string];
      const row = rows.find((r) => r.id === id);
      if (row) row.anchor_message_id = anchorMessageId;
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    if (text.includes("SET status = 'expired'")) {
      const now = new Date();
      let count = 0;
      for (const row of rows) {
        if (row.status === 'active' && row.expires_at.getTime() <= now.getTime()) {
          row.status = 'expired';
          count++;
        }
      }
      return { rows: [], rowCount: count };
    }

    throw new Error(`unhandled fake query: ${text}`);
  });

  return { query, rows } as unknown as Pool & { rows: FakeRow[] };
}

describe('resolveSessionType', () => {
  it('routes payload.kind === "help_menu" to the help_menu session type', () => {
    expect(resolveSessionType({ kind: 'help_menu', topic: 'main', history: [] })).toBe('help_menu');
  });

  it('routes any other payload shape (including no kind field) to confirmation', () => {
    expect(resolveSessionType({ movementType: 'MASUK', lines: [] })).toBe('confirmation');
    expect(resolveSessionType({ kind: 'clear_recent' })).toBe('confirmation');
    expect(resolveSessionType(null)).toBe('confirmation');
    expect(resolveSessionType('not-an-object')).toBe('confirmation');
  });
});

describe('createSessionService', () => {
  let pool: ReturnType<typeof makeFakePool>;
  let service: ReturnType<typeof createSessionService>;

  beforeEach(() => {
    pool = makeFakePool();
    service = createSessionService(pool);
  });

  it('writes session_type based on the payload discriminator', async () => {
    const helpMenu = await service.createConfirmation({
      userId: 'u1',
      groupId: 'g1',
      chatId: 'c1',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
      ttlMinutes: 2,
    });
    const confirmation = await service.createConfirmation({
      userId: 'u1',
      groupId: 'g1',
      chatId: 'c1',
      payload: { movementType: 'MASUK' },
      ttlMinutes: 2,
    });

    expect(pool.rows.find((r) => r.id === helpMenu.sessionId)?.session_type).toBe('help_menu');
    expect(pool.rows.find((r) => r.id === confirmation.sessionId)?.session_type).toBe('confirmation');
  });

  it('sweeps active sessions past their expiry into the expired status', async () => {
    const past = await service.createConfirmation({
      userId: 'u1',
      groupId: 'g1',
      chatId: 'c1',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
      ttlMinutes: 2,
    });
    // Force this row's expires_at into the past, as if 2 minutes had elapsed.
    const row = pool.rows.find((r) => r.id === past.sessionId)!;
    row.expires_at = new Date(Date.now() - 1000);

    const future = await service.createConfirmation({
      userId: 'u1',
      groupId: 'g1',
      chatId: 'c1',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
      ttlMinutes: 2,
    });

    const sweptCount = await service.sweepExpired();

    expect(sweptCount).toBe(1);
    expect((await service.getSession(past.sessionId))?.status).toBe('expired');
    expect((await service.getSession(future.sessionId))?.status).toBe('active');
  });

  it('resolveByQuotedReply only returns the session to the same user and group it belongs to', async () => {
    const { sessionId } = await service.createConfirmation({
      userId: 'owner-user',
      groupId: 'group-a',
      chatId: 'chat-1',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
      ttlMinutes: 2,
      anchorMessageId: 'anchor-1',
    });

    const forOwner = await service.resolveByQuotedReply('anchor-1', 'owner-user', 'group-a');
    expect(forOwner?.id).toBe(sessionId);

    const forDifferentUser = await service.resolveByQuotedReply('anchor-1', 'someone-else', 'group-a');
    expect(forDifferentUser).toBeNull();

    const forDifferentGroup = await service.resolveByQuotedReply('anchor-1', 'owner-user', 'group-b');
    expect(forDifferentGroup).toBeNull();
  });

  it('cancelSession only affects an active session and is a no-op afterwards', async () => {
    const { sessionId } = await service.createConfirmation({
      userId: 'u1',
      groupId: 'g1',
      chatId: 'c1',
      payload: { kind: 'help_menu', topic: 'main', history: [] },
      ttlMinutes: 2,
    });

    await service.cancelSession(sessionId);
    expect((await service.getSession(sessionId))?.status).toBe('cancelled');

    // Cancelling again (e.g. duplicate !cancel) must not resurrect it or throw.
    await service.cancelSession(sessionId);
    expect((await service.getSession(sessionId))?.status).toBe('cancelled');
  });
});
