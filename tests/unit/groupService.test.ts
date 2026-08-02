import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';
import * as groupService from '../../src/group-user-service/groupService.js';

function fakeClient(...rowsPerCall: unknown[][]): PoolClient {
  const query = vi.fn();
  for (const rows of rowsPerCall) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query } as unknown as PoolClient;
}

describe('groupService.registerGroup', () => {
  it('creates a brand-new warehouse and group when neither exists yet', async () => {
    const client = fakeClient(
      [], // 1: existing bot_groups lookup -> none
      [], // 2: existing warehouse lookup -> none
      [{ id: 'wh-1', name: 'Gudang Utama' }], // 3: warehouse insert
      [{ id: 'grp-1' }], // 4: group insert
      [], // 5: audit insert
    );

    const result = await groupService.registerGroup(client, {
      whatsappGroupId: 'group-1@g.us',
      warehouseName: 'Gudang Utama',
      ownerUserId: 'owner-1',
      whatsappMessageId: 'msg-1',
    });

    expect(result.text).toContain('Gudang Utama');
    expect(result.text).toContain('Aktif');
    expect(client.query).toHaveBeenCalledTimes(5);
  });

  it('reuses an existing warehouse instead of creating a duplicate', async () => {
    const client = fakeClient(
      [], // no existing group
      [{ id: 'wh-existing', name: 'Gudang Utama' }], // warehouse already exists
      [{ id: 'grp-1' }], // group insert
      [], // audit insert
    );

    const result = await groupService.registerGroup(client, {
      whatsappGroupId: 'group-1@g.us',
      warehouseName: 'gudang utama', // different casing on purpose
      ownerUserId: 'owner-1',
      whatsappMessageId: 'msg-1',
    });

    // Only 4 queries: no warehouse INSERT was issued because one was found.
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(result.text).toContain('Gudang Utama');
  });

  it('reactivates a previously deactivated group instead of failing on the unique constraint', async () => {
    const client = fakeClient(
      [{ id: 'grp-existing', warehouse_id: 'wh-old', is_active: false }], // group row already exists, inactive
      [{ id: 'wh-1', name: 'Gudang Utama' }], // warehouse found
      [{ id: 'grp-existing' }], // UPDATE ... RETURNING id
      [], // audit insert
    );

    const result = await groupService.registerGroup(client, {
      whatsappGroupId: 'group-1@g.us',
      warehouseName: 'Gudang Utama',
      ownerUserId: 'owner-1',
      whatsappMessageId: 'msg-1',
    });

    const queryMock = client.query as unknown as ReturnType<typeof vi.fn>;
    const updateCall = queryMock.mock.calls.find((call) => String(call[0]).includes('UPDATE bot_groups'));
    expect(updateCall).toBeDefined();
    expect(result.text).toContain('Aktif');
  });

  it('rejects an empty warehouse name without touching the database', async () => {
    const client = fakeClient();

    await expect(
      groupService.registerGroup(client, {
        whatsappGroupId: 'group-1@g.us',
        warehouseName: '   ',
        ownerUserId: 'owner-1',
        whatsappMessageId: 'msg-1',
      }),
    ).rejects.toThrow(/Nama gudang wajib diisi/);

    expect(client.query).not.toHaveBeenCalled();
  });
});

describe('groupService.setGroupActive', () => {
  it('toggles is_active and returns a friendly confirmation', async () => {
    const client = fakeClient(
      [{ is_active: true, warehouse_id: 'wh-1' }], // current state
      [], // UPDATE
      [], // audit insert
    );

    const result = await groupService.setGroupActive(client, {
      groupId: 'grp-1',
      isActive: false,
      performedBy: 'owner-1',
      whatsappMessageId: 'msg-1',
    });

    expect(result.text).toMatch(/dinonaktifkan/);
  });

  it('throws a friendly error when the group cannot be found', async () => {
    const client = fakeClient([]);

    await expect(
      groupService.setGroupActive(client, {
        groupId: 'missing',
        isActive: true,
        performedBy: 'owner-1',
        whatsappMessageId: 'msg-1',
      }),
    ).rejects.toThrow(/tidak ditemukan/);
  });
});
