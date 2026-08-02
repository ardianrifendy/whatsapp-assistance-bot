import { describe, it, expect } from 'vitest';
import '../../src/group-user-service/commands/index.js';
import { getCommand } from '../../src/command-router/registry.js';
import { AccessDeniedError } from '../../src/shared/errors.js';
import type { HandlerContext } from '../../src/types/context.js';

function baseCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    messageId: 'm1',
    chatId: 'group-1@g.us',
    groupId: 'group-uuid-1',
    warehouseId: 'warehouse-uuid-1',
    senderJid: '628111@c.us',
    userId: 'user-1',
    role: 'user',
    isOwner: false,
    quotedMessageId: null,
    sessionId: null,
    args: [],
    rawBody: '',
    ...overrides,
  };
}

describe('!grup and !user permission matrix (as registered by commands/index.ts)', () => {
  const expected: Array<{
    name: string;
    allowedRoles: 'any' | Array<'owner' | 'admin' | 'user'>;
    requiresRegisteredGroup: boolean;
  }> = [
    { name: 'grup daftar', allowedRoles: 'any', requiresRegisteredGroup: false },
    { name: 'grup status', allowedRoles: 'any', requiresRegisteredGroup: true },
    { name: 'grup aktif', allowedRoles: ['owner'], requiresRegisteredGroup: true },
    { name: 'grup nonaktif', allowedRoles: ['owner'], requiresRegisteredGroup: true },
    { name: 'grup list', allowedRoles: ['owner'], requiresRegisteredGroup: true },
    { name: 'user tambah', allowedRoles: ['owner', 'admin'], requiresRegisteredGroup: true },
    { name: 'user role', allowedRoles: ['owner'], requiresRegisteredGroup: true },
    { name: 'user aktif', allowedRoles: ['owner', 'admin'], requiresRegisteredGroup: true },
    { name: 'user nonaktif', allowedRoles: ['owner', 'admin'], requiresRegisteredGroup: true },
    { name: 'user list', allowedRoles: ['owner', 'admin'], requiresRegisteredGroup: true },
  ];

  for (const c of expected) {
    it(`"${c.name}" -> allowedRoles=${JSON.stringify(c.allowedRoles)}, requiresRegisteredGroup=${c.requiresRegisteredGroup}`, () => {
      const def = getCommand(c.name);
      expect(def, `command "${c.name}" was not registered`).toBeDefined();
      expect(def?.allowedRoles).toEqual(c.allowedRoles);
      expect(def?.requiresRegisteredGroup).toBe(c.requiresRegisteredGroup);
      expect(def?.requiresPreviewConfirm).toBe(false);
    });
  }

  it('only Owner can promote/demote a role via "user role" (prd.md: role Admin only via Owner)', () => {
    expect(getCommand('user role')?.allowedRoles).toEqual(['owner']);
  });

  it('"grup daftar" rejects a non-Owner sender at the handler level, before touching the database', async () => {
    const def = getCommand('grup daftar')!;
    const ctx = baseCtx({
      isOwner: false,
      role: 'user',
      groupId: '',
      warehouseId: '',
      args: ['Gudang', 'Utama'],
      rawBody: '!grup daftar Gudang Utama',
    });

    await expect(def.handler(ctx)).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
