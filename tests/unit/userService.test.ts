import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';
import * as userService from '../../src/group-user-service/userService.js';
import { UserFacingError } from '../../src/shared/errors.js';

function fakeClient(...rowsPerCall: unknown[][]): PoolClient {
  const query = vi.fn();
  for (const rows of rowsPerCall) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query } as unknown as PoolClient;
}

describe('userService.addUser', () => {
  it('rejects any trailing role token other than "user" (promotion must go through "!user role")', async () => {
    const client = fakeClient();

    await expect(
      userService.addUser(client, {
        whatsappNumber: '628123456789',
        displayName: 'Budi',
        roleToken: 'admin',
        groupId: 'grp-1',
        performedBy: 'owner-1',
        whatsappMessageId: 'msg-1',
      }),
    ).rejects.toThrow(UserFacingError);

    expect(client.query).not.toHaveBeenCalled();
  });

  it('creates a new bot_users row and an active "user" membership when neither exists', async () => {
    const client = fakeClient(
      [], // bot_users lookup -> none
      [{ id: 'user-1' }], // bot_users insert
      [], // group_members lookup -> none
      [], // group_members insert
      [], // audit insert
    );

    const result = await userService.addUser(client, {
      whatsappNumber: '628-123-456-789',
      displayName: 'Budi',
      roleToken: 'USER', // case-insensitive
      groupId: 'grp-1',
      performedBy: 'owner-1',
      whatsappMessageId: 'msg-1',
    });

    expect(result.text).toContain('Budi');
    expect(result.text).toContain('berhasil didaftarkan');
  });

  it('reports back when the number is already an active member of this group', async () => {
    const client = fakeClient(
      [{ id: 'user-1', is_active: true }], // bot_users exists
      [], // display_name update
      [{ id: 'member-1', is_active: true, role: 'admin' }], // already an active member
    );

    const result = await userService.addUser(client, {
      whatsappNumber: '628123456789',
      displayName: 'Budi',
      roleToken: 'user',
      groupId: 'grp-1',
      performedBy: 'owner-1',
      whatsappMessageId: 'msg-1',
    });

    expect(result.text).toMatch(/sudah terdaftar/);
  });
});

describe('userService.setUserRole (permission-adjacent business rule)', () => {
  it('rejects an unrecognized role value before querying the database', async () => {
    const client = fakeClient();

    await expect(
      userService.setUserRole(client, {
        whatsappNumber: '628123456789',
        role: 'superadmin',
        groupId: 'grp-1',
        performedBy: 'owner-1',
        whatsappMessageId: 'msg-1',
      }),
    ).rejects.toThrow(/Role tidak dikenal/);

    expect(client.query).not.toHaveBeenCalled();
  });

  it('promotes an existing active member to admin', async () => {
    const client = fakeClient(
      [{ id: 'user-1', is_active: true, display_name: 'Budi' }], // bot_users lookup
      [{ id: 'member-1', role: 'user', is_active: true }], // group_members lookup
      [], // UPDATE
      [], // audit insert
    );

    const result = await userService.setUserRole(client, {
      whatsappNumber: '628123456789',
      role: 'admin',
      groupId: 'grp-1',
      performedBy: 'owner-1',
      whatsappMessageId: 'msg-1',
    });

    expect(result.text).toMatch(/admin/);
  });

  it('rejects when the number has no bot_users row', async () => {
    const client = fakeClient([]);

    await expect(
      userService.setUserRole(client, {
        whatsappNumber: '628123456789',
        role: 'admin',
        groupId: 'grp-1',
        performedBy: 'owner-1',
        whatsappMessageId: 'msg-1',
      }),
    ).rejects.toThrow(/belum terdaftar/);
  });

  it('rejects when the user is not a member of the current group', async () => {
    const client = fakeClient(
      [{ id: 'user-1', is_active: true, display_name: 'Budi' }],
      [], // no group_members row
    );

    await expect(
      userService.setUserRole(client, {
        whatsappNumber: '628123456789',
        role: 'admin',
        groupId: 'grp-1',
        performedBy: 'owner-1',
        whatsappMessageId: 'msg-1',
      }),
    ).rejects.toThrow(/belum menjadi anggota/);
  });
});

describe('userService.maskWhatsappNumber', () => {
  it('masks the middle digits of a normal-length number', () => {
    expect(userService.maskWhatsappNumber('6281234567890')).toBe('6281******890');
  });

  it('returns short numbers unmasked to avoid an all-asterisk result', () => {
    expect(userService.maskWhatsappNumber('12345')).toBe('12345');
  });
});
