import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { createAccessResolver } from '../../src/access-control/resolveAccess.js';
import type { NormalizedIncomingMessage } from '../../src/command-router/dispatch.js';

interface FakeRows {
  group?: { id: string; warehouse_id: string; is_active: boolean } | null;
  user?: { id: string; is_owner: boolean; is_active: boolean } | null;
  membership?: { role: string; is_active: boolean } | null;
}

/**
 * A minimal fake Pool that routes each SQL statement to canned rows based
 * on which table it targets. Mirrors the mocking style used in
 * tests/unit/dispatch.test.ts (no live database).
 */
function makeFakePool(rows: FakeRows): Pool {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM bot_groups')) {
        return { rows: rows.group ? [rows.group] : [] };
      }
      if (sql.includes('FROM bot_users')) {
        return { rows: rows.user ? [rows.user] : [] };
      }
      if (sql.includes('FROM group_members')) {
        return { rows: rows.membership ? [rows.membership] : [] };
      }
      throw new Error(`unexpected query in test: ${sql}`);
    }),
  } as unknown as Pool;
}

function baseMessage(overrides: Partial<NormalizedIncomingMessage> = {}): NormalizedIncomingMessage {
  return {
    messageId: 'msg-1',
    chatId: 'group-1@g.us',
    whatsappGroupId: 'group-1@g.us',
    senderJid: '628111@c.us',
    senderNumber: '628111',
    quotedMessageId: null,
    command: 'grup daftar',
    args: ['Gudang', 'Utama'],
    rawBody: '!grup daftar Gudang Utama',
    ...overrides,
  };
}

describe('resolveAccess: "grup daftar" owner-bypass', () => {
  it('grants an active Owner in an unregistered group', async () => {
    const pool = makeFakePool({
      group: null,
      user: { id: 'owner-1', is_owner: true, is_active: true },
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage(), 'grup daftar');

    expect(result).toEqual({ granted: true, userId: 'owner-1', role: 'owner', isOwner: true });
  });

  it('denies a non-Owner sender in an unregistered group', async () => {
    const pool = makeFakePool({
      group: null,
      user: { id: 'user-1', is_owner: false, is_active: true },
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage(), 'grup daftar');

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/belum terdaftar/i);
  });

  it('denies an unregistered sender in an unregistered group', async () => {
    const pool = makeFakePool({ group: null, user: null });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage(), 'grup daftar');

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/Nomor Anda belum terdaftar/);
  });

  it('does not extend the bypass to any other command', async () => {
    const pool = makeFakePool({
      group: null,
      user: { id: 'owner-1', is_owner: true, is_active: true },
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'stok list' }), 'stok list');

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/Grup ini belum terdaftar/);
  });

  it('treats an inactive group the same as a missing one', async () => {
    const pool = makeFakePool({
      group: { id: 'group-uuid', warehouse_id: 'wh-uuid', is_active: false },
      user: { id: 'owner-1', is_owner: true, is_active: true },
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'grup aktif' }), 'grup aktif');

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/Grup ini belum terdaftar/);
  });
});

describe('resolveAccess: role resolution', () => {
  const registeredGroup = { id: 'group-uuid-1', warehouse_id: 'warehouse-uuid-1', is_active: true };

  it('always grants role "owner" for an Owner sender, even with no group_members row', async () => {
    const pool = makeFakePool({
      group: registeredGroup,
      user: { id: 'owner-1', is_owner: true, is_active: true },
      membership: null,
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'stok list' }), 'stok list');

    expect(result).toEqual({
      granted: true,
      userId: 'owner-1',
      role: 'owner',
      isOwner: true,
      groupId: 'group-uuid-1',
      warehouseId: 'warehouse-uuid-1',
    });
  });

  it('resolves an admin role from an active group_members row', async () => {
    const pool = makeFakePool({
      group: registeredGroup,
      user: { id: 'admin-1', is_owner: false, is_active: true },
      membership: { role: 'admin', is_active: true },
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'user tambah' }), 'user tambah');

    expect(result.granted).toBe(true);
    expect(result.role).toBe('admin');
    expect(result.isOwner).toBe(false);
  });

  it('resolves a user role from an active group_members row', async () => {
    const pool = makeFakePool({
      group: registeredGroup,
      user: { id: 'user-1', is_owner: false, is_active: true },
      membership: { role: 'user', is_active: true },
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'stok list' }), 'stok list');

    expect(result.granted).toBe(true);
    expect(result.role).toBe('user');
  });

  it('denies a sender with no group_members row for the current group', async () => {
    const pool = makeFakePool({
      group: registeredGroup,
      user: { id: 'user-1', is_owner: false, is_active: true },
      membership: null,
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'stok list' }), 'stok list');

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/belum terdaftar sebagai anggota/);
  });

  it('denies an inactive group_members row', async () => {
    const pool = makeFakePool({
      group: registeredGroup,
      user: { id: 'user-1', is_owner: false, is_active: true },
      membership: { role: 'user', is_active: false },
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'stok list' }), 'stok list');

    expect(result.granted).toBe(false);
  });

  it('denies an unregistered sender even in a registered group', async () => {
    const pool = makeFakePool({ group: registeredGroup, user: null });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'stok list' }), 'stok list');

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/Nomor Anda belum terdaftar/);
  });

  it('denies an inactive sender even in a registered group', async () => {
    const pool = makeFakePool({
      group: registeredGroup,
      user: { id: 'user-1', is_owner: false, is_active: false },
    });
    const resolveAccess = createAccessResolver(pool);

    const result = await resolveAccess(baseMessage({ command: 'stok list' }), 'stok list');

    expect(result.granted).toBe(false);
    expect(result.reason).toMatch(/Nomor Anda belum terdaftar/);
  });
});
