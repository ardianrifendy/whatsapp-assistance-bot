import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { withTransaction } from '../../persistence/transactions.js';
import { AccessDeniedError } from '../../shared/errors.js';
import * as groupService from '../groupService.js';

registerCommand({
  name: 'grup daftar',
  allowedRoles: 'any',
  // Bypass case: must be reachable even when bot_groups has no row yet.
  requiresRegisteredGroup: false,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    // The registry's allowedRoles gate operates on a single role value and
    // can't distinguish "Owner, group not yet registered" from "Owner of
    // an already-registered group" vs "non-Owner member of an
    // already-registered group" — all three reach this handler with
    // different ctx shapes. So allowedRoles stays 'any' and the real
    // Owner-only rule (prd.md: "Owner dapat mendaftarkan grup dari dalam
    // grup") is enforced here instead.
    if (!ctx.isOwner) {
      throw new AccessDeniedError('Hanya Owner yang dapat mendaftarkan grup.');
    }

    const warehouseName = ctx.args.join(' ').trim();

    return withTransaction((client) =>
      groupService.registerGroup(client, {
        // ctx.chatId is the raw WhatsApp group JID here: dispatch() only
        // ever reaches handlers for messages where whatsappGroupId was
        // non-null, and message-normalizer sets both chatId and
        // whatsappGroupId to message.from for group messages.
        whatsappGroupId: ctx.chatId,
        warehouseName,
        ownerUserId: ctx.userId,
        whatsappMessageId: ctx.messageId,
      }),
    );
  },
});

registerCommand({
  name: 'grup status',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => groupService.getGroupStatus(pool, ctx.groupId),
});

registerCommand({
  name: 'grup aktif',
  allowedRoles: ['owner'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) =>
    withTransaction((client) =>
      groupService.setGroupActive(client, {
        groupId: ctx.groupId,
        isActive: true,
        performedBy: ctx.userId,
        whatsappMessageId: ctx.messageId,
      }),
    ),
});

registerCommand({
  name: 'grup nonaktif',
  allowedRoles: ['owner'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) =>
    withTransaction((client) =>
      groupService.setGroupActive(client, {
        groupId: ctx.groupId,
        isActive: false,
        performedBy: ctx.userId,
        whatsappMessageId: ctx.messageId,
      }),
    ),
});

registerCommand({
  name: 'grup list',
  allowedRoles: ['owner'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async () => groupService.listGroups(pool),
});
