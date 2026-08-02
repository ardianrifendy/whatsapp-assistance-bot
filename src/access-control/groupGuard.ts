import type { Pool, PoolClient } from 'pg';

export interface ActiveGroup {
  id: string;
  warehouseId: string;
}

interface BotGroupRow {
  id: string;
  warehouse_id: string;
  is_active: boolean;
}

/**
 * Returns the group only if a row exists for this WhatsApp group id AND it
 * is active. An inactive group is treated identically to a missing one by
 * the access resolver for every command except "grup daftar" — the only
 * way to bring a deactivated group back is Owner re-registration (see
 * group-user-service/groupService.ts registerGroup()).
 */
export async function findActiveGroupByWhatsappId(
  client: Pool | PoolClient,
  whatsappGroupId: string,
): Promise<ActiveGroup | null> {
  const result = await client.query<BotGroupRow>(
    `SELECT id, warehouse_id, is_active FROM bot_groups WHERE whatsapp_group_id = $1`,
    [whatsappGroupId],
  );
  const row = result.rows[0];
  if (!row || !row.is_active) return null;
  return { id: row.id, warehouseId: row.warehouse_id };
}
