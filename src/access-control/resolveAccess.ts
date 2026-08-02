import type { Pool } from 'pg';
import type { AccessResolution, NormalizedIncomingMessage } from '../command-router/dispatch.js';
import { OWNER_GROUP_BYPASS_COMMAND } from './ownerGuard.js';
import { findActiveGroupByWhatsappId } from './groupGuard.js';
import { findActiveUserByNumber } from './userGuard.js';
import { findActiveMembership } from './roleGuard.js';

const GROUP_NOT_REGISTERED_REASON = 'Grup ini belum terdaftar. Hubungi Owner untuk mendaftarkan grup.';
const USER_NOT_REGISTERED_REASON = 'Nomor Anda belum terdaftar. Hubungi Admin atau Owner untuk didaftarkan.';
const MEMBERSHIP_NOT_ACTIVE_REASON = 'Anda belum terdaftar sebagai anggota grup ini. Hubungi Admin atau Owner.';

/**
 * Builds the resolveAccess function required by DispatchDeps
 * (src/command-router/dispatch.ts). Resolution order (feature.md #1/#2,
 * prd.md "Akses", agents-subagents.md Worker B scope):
 *
 *   1. Look up bot_groups by msg.whatsappGroupId.
 *      - Missing or inactive: only "grup daftar" may proceed past this
 *        point, and only if the sender turns out to be an active Owner
 *        (checked next) — every other command is rejected here.
 *   2. Look up bot_users by msg.senderNumber (already normalized).
 *      - Missing or inactive: reject, regardless of the group outcome.
 *   3. If bot_users.is_owner: grant with role 'owner'. Owners don't need a
 *      group_members row — ownership is global, not per-group.
 *   4. Otherwise look up group_members for (group, user).
 *      - Missing or inactive membership: reject.
 *      - Otherwise: grant with that row's role ('admin' | 'user').
 */
export function createAccessResolver(
  pool: Pool,
): (msg: NormalizedIncomingMessage, command: string) => Promise<AccessResolution> {
  return async function resolveAccess(
    msg: NormalizedIncomingMessage,
    command: string,
  ): Promise<AccessResolution> {
    if (!msg.whatsappGroupId) {
      // Defensive: dispatch() already drops non-group messages before
      // resolveAccess is ever called, so this branch should be unreachable
      // in production, but resolveAccess must stay total.
      return { granted: false, reason: GROUP_NOT_REGISTERED_REASON };
    }

    const group = await findActiveGroupByWhatsappId(pool, msg.whatsappGroupId);

    if (!group) {
      if (command !== OWNER_GROUP_BYPASS_COMMAND) {
        return { granted: false, reason: GROUP_NOT_REGISTERED_REASON };
      }

      const user = await findActiveUserByNumber(pool, msg.senderNumber);
      if (!user) {
        return { granted: false, reason: USER_NOT_REGISTERED_REASON };
      }
      if (!user.isOwner) {
        return { granted: false, reason: GROUP_NOT_REGISTERED_REASON };
      }

      // Owner bypass: group intentionally has no id/warehouseId yet — the
      // "grup daftar" handler itself creates both.
      return { granted: true, userId: user.id, role: 'owner', isOwner: true };
    }

    const user = await findActiveUserByNumber(pool, msg.senderNumber);
    if (!user) {
      return { granted: false, reason: USER_NOT_REGISTERED_REASON };
    }

    if (user.isOwner) {
      return {
        granted: true,
        userId: user.id,
        role: 'owner',
        isOwner: true,
        groupId: group.id,
        warehouseId: group.warehouseId,
      };
    }

    const membership = await findActiveMembership(pool, group.id, user.id);
    if (!membership) {
      return { granted: false, reason: MEMBERSHIP_NOT_ACTIVE_REASON };
    }

    return {
      granted: true,
      userId: user.id,
      role: membership.role,
      isOwner: false,
      groupId: group.id,
      warehouseId: group.warehouseId,
    };
  };
}
