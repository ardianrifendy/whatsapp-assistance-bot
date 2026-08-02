import type { Pool, PoolClient } from 'pg';
import { logAudit } from '../audit-service/auditService.js';
import { UserFacingError } from '../shared/errors.js';
import type { CommandResult } from '../types/command.js';

type DbClient = Pool | PoolClient;

interface RegisterGroupInput {
  whatsappGroupId: string;
  warehouseName: string;
  ownerUserId: string;
  whatsappMessageId: string;
}

interface WarehouseRow {
  id: string;
  name: string;
}

interface BotGroupRow {
  id: string;
  warehouse_id: string;
  is_active: boolean;
}

/**
 * Registers (or re-registers/reactivates) the current WhatsApp group.
 * Caller (commands/grup.ts) is responsible for verifying ctx.isOwner and
 * for wrapping this call in withTransaction() so the warehouse lookup,
 * group upsert, and audit row commit atomically.
 *
 * Design decisions (documented per manager's instructions, since these
 * were left to Worker B's judgment):
 *
 * 1. Warehouse naming/reuse: warehouse names are matched case-insensitively
 *    (trimmed). If an active warehouse with this exact name already
 *    exists, the group is mapped onto it instead of creating a duplicate —
 *    this lets an Owner deliberately map two groups onto one physical
 *    warehouse by typing the same name. A never-seen name always creates a
 *    brand-new warehouse row.
 *
 * 2. Reactivation: bot_groups.whatsapp_group_id is UNIQUE, so if a row
 *    already exists for this WhatsApp group (e.g. it was previously
 *    deactivated via "!grup nonaktif"), this UPDATEs that row in place
 *    (warehouse mapping, name, registered_by, is_active=true) rather than
 *    failing on the unique constraint or leaving a second row behind.
 *    This is intentionally the ONLY way to bring a deactivated group back:
 *    resolveAccess.ts treats an inactive group exactly like a missing one
 *    for every command except "grup daftar", so "!grup aktif" can never
 *    reach a group that's currently inactive — only re-registration can.
 */
export async function registerGroup(client: DbClient, input: RegisterGroupInput): Promise<CommandResult> {
  const name = input.warehouseName.trim();
  if (!name) {
    throw new UserFacingError(
      'GRUP_DAFTAR_USAGE',
      'Nama gudang wajib diisi. Contoh: !grup daftar Gudang Utama',
    );
  }

  const existingGroupResult = await client.query<BotGroupRow>(
    `SELECT id, warehouse_id, is_active FROM bot_groups WHERE whatsapp_group_id = $1`,
    [input.whatsappGroupId],
  );
  const existingGroup = existingGroupResult.rows[0];

  const existingWarehouseResult = await client.query<WarehouseRow>(
    `SELECT id, name FROM warehouses WHERE lower(name) = lower($1) AND is_active = true LIMIT 1`,
    [name],
  );
  let warehouse = existingWarehouseResult.rows[0];

  if (!warehouse) {
    const insertedWarehouse = await client.query<WarehouseRow>(
      `INSERT INTO warehouses (name) VALUES ($1) RETURNING id, name`,
      [name],
    );
    const row = insertedWarehouse.rows[0];
    if (!row) throw new Error('failed to create warehouse');
    warehouse = row;
  }

  let groupId: string;
  let beforeData: Record<string, unknown> | null = null;

  if (existingGroup) {
    beforeData = { warehouseId: existingGroup.warehouse_id, isActive: existingGroup.is_active };
    const updated = await client.query<{ id: string }>(
      `UPDATE bot_groups
       SET warehouse_id = $1, name = $2, is_active = true, registered_by = $3
       WHERE id = $4
       RETURNING id`,
      [warehouse.id, name, input.ownerUserId, existingGroup.id],
    );
    const row = updated.rows[0];
    if (!row) throw new Error('failed to update group');
    groupId = row.id;
  } else {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO bot_groups (whatsapp_group_id, warehouse_id, name, is_active, registered_by)
       VALUES ($1, $2, $3, true, $4)
       RETURNING id`,
      [input.whatsappGroupId, warehouse.id, name, input.ownerUserId],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('failed to create group');
    groupId = row.id;
  }

  await logAudit(client, {
    action: 'group_registered',
    targetType: 'bot_group',
    targetId: groupId,
    performedBy: input.ownerUserId,
    groupId,
    warehouseId: warehouse.id,
    beforeData,
    afterData: { warehouseId: warehouse.id, warehouseName: warehouse.name, isActive: true },
    whatsappMessageId: input.whatsappMessageId,
  });

  return {
    text: `Grup berhasil didaftarkan.\nGudang: ${warehouse.name}\nStatus: Aktif`,
  };
}

interface GroupStatusRow {
  name: string | null;
  is_active: boolean;
  warehouse_name: string;
}

/** "!grup status" — visible to any registered role in the current group. */
export async function getGroupStatus(client: DbClient, groupId: string): Promise<CommandResult> {
  const result = await client.query<GroupStatusRow>(
    `SELECT g.name, g.is_active, w.name AS warehouse_name
     FROM bot_groups g
     JOIN warehouses w ON w.id = g.warehouse_id
     WHERE g.id = $1`,
    [groupId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new UserFacingError('GROUP_NOT_FOUND', 'Data grup tidak ditemukan.');
  }

  return {
    text: [`Gudang: ${row.warehouse_name}`, `Status: ${row.is_active ? 'Aktif' : 'Nonaktif'}`].join('\n'),
  };
}

interface SetGroupActiveInput {
  groupId: string;
  isActive: boolean;
  performedBy: string;
  whatsappMessageId: string;
}

/** "!grup aktif" / "!grup nonaktif" — Owner-only, enforced at the command definition. */
export async function setGroupActive(client: DbClient, input: SetGroupActiveInput): Promise<CommandResult> {
  const current = await client.query<{ is_active: boolean; warehouse_id: string }>(
    `SELECT is_active, warehouse_id FROM bot_groups WHERE id = $1`,
    [input.groupId],
  );
  const row = current.rows[0];
  if (!row) {
    throw new UserFacingError('GROUP_NOT_FOUND', 'Data grup tidak ditemukan.');
  }

  await client.query(`UPDATE bot_groups SET is_active = $1 WHERE id = $2`, [input.isActive, input.groupId]);

  await logAudit(client, {
    action: input.isActive ? 'group_activated' : 'group_deactivated',
    targetType: 'bot_group',
    targetId: input.groupId,
    performedBy: input.performedBy,
    groupId: input.groupId,
    warehouseId: row.warehouse_id,
    beforeData: { isActive: row.is_active },
    afterData: { isActive: input.isActive },
    whatsappMessageId: input.whatsappMessageId,
  });

  return { text: input.isActive ? 'Grup ini telah diaktifkan.' : 'Grup ini telah dinonaktifkan.' };
}

interface GroupListRow {
  name: string | null;
  is_active: boolean;
  warehouse_name: string;
}

/** "!grup list" — Owner-only, enforced at the command definition (sees every group). */
export async function listGroups(client: DbClient): Promise<CommandResult> {
  const result = await client.query<GroupListRow>(
    `SELECT g.name, g.is_active, w.name AS warehouse_name
     FROM bot_groups g
     JOIN warehouses w ON w.id = g.warehouse_id
     ORDER BY g.created_at ASC`,
  );

  if (result.rows.length === 0) {
    return { text: 'Belum ada grup yang terdaftar.' };
  }

  const lines = result.rows.map((r, i) => {
    const label = r.name ?? '(tanpa nama)';
    const status = r.is_active ? 'Aktif' : 'Nonaktif';
    return `${i + 1}. ${label} — Gudang: ${r.warehouse_name} — ${status}`;
  });

  return { text: ['Daftar grup terdaftar:', ...lines].join('\n') };
}
