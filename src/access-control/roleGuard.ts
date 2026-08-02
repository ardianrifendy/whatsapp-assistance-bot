import type { Pool, PoolClient } from 'pg';
import type { Role } from '../types/context.js';

export interface ActiveMembership {
  role: Exclude<Role, 'owner'>;
}

interface GroupMemberRow {
  role: string;
  is_active: boolean;
}

/**
 * Returns this user's membership row for the group only if it exists AND
 * is active. `group_members.role` is a DB CHECK-constrained to
 * 'admin' | 'user' — 'owner' is never stored here, it is derived from
 * bot_users.is_owner upstream in resolveAccess.ts.
 */
export async function findActiveMembership(
  client: Pool | PoolClient,
  groupId: string,
  userId: string,
): Promise<ActiveMembership | null> {
  const result = await client.query<GroupMemberRow>(
    `SELECT role, is_active FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  );
  const row = result.rows[0];
  if (!row || !row.is_active) return null;
  return { role: row.role as Exclude<Role, 'owner'> };
}
