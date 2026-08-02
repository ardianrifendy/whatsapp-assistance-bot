import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { createSessionService } from '../../conversation-session/sessionService.real.js';
import { env } from '../../config/env.js';
import { UserFacingError } from '../../shared/errors.js';
import {
  logClearAllRequested,
  logClearBot,
  logClearRecentRequested,
  logClearSaya,
} from '../clearService.js';
import type { ClearAllPayload, ClearRecentPayload } from '../clearService.js';

const sessionService = createSessionService(pool);

const MAX_CLEAR_RECENT = 200;

registerCommand({
  name: 'clear bot',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    await logClearBot(pool, {
      performedBy: ctx.userId,
      groupId: ctx.groupId,
      chatId: ctx.chatId,
      messageId: ctx.messageId,
    });
    return {
      text: 'Menghapus pesan bot di chat ini.',
      clearAction: { scope: 'bot' },
    };
  },
});

registerCommand({
  name: 'clear saya',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    await logClearSaya(pool, {
      performedBy: ctx.userId,
      groupId: ctx.groupId,
      chatId: ctx.chatId,
      messageId: ctx.messageId,
    });
    return {
      text: 'Menghapus pesan Anda di chat ini.',
      clearAction: { scope: 'saya', targetSenderJid: ctx.senderJid },
    };
  },
});

registerCommand({
  name: 'clear recent',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: true,
  handler: async (ctx) => {
    const raw = ctx.args[0];
    const limit = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new UserFacingError(
        'INVALID_ARG',
        'Gunakan format: !clear recent <jumlah>, contoh: !clear recent 20',
      );
    }
    if (limit > MAX_CLEAR_RECENT) {
      throw new UserFacingError(
        'INVALID_ARG',
        `Jumlah maksimum untuk !clear recent adalah ${MAX_CLEAR_RECENT}.`,
      );
    }

    await logClearRecentRequested(pool, {
      performedBy: ctx.userId,
      groupId: ctx.groupId,
      chatId: ctx.chatId,
      messageId: ctx.messageId,
      limit,
    });

    const payload: ClearRecentPayload = {
      kind: 'clear_recent',
      chatId: ctx.chatId,
      groupId: ctx.groupId,
      requestedBy: ctx.userId,
      limit,
    };
    const { sessionId } = await sessionService.createConfirmation({
      userId: ctx.userId,
      groupId: ctx.groupId,
      chatId: ctx.chatId,
      payload,
      ttlMinutes: env.SESSION_EXPIRY_MINUTES,
    });

    return {
      text: `Anda akan menghapus ${limit} pesan terakhir di chat ini. Balas (quote) pesan ini dengan !ya untuk konfirmasi atau !cancel untuk membatalkan.`,
      pendingSessionId: sessionId,
    };
  },
});

/**
 * "!clear all" — Owner-only, and disabled entirely on MVP per feature.md
 * section 9 ("`!clear all` hanya Owner dan disabled pada MVP sampai
 * pengujian selesai."). Registering it at all is gated on env.ENABLE_CLEAR_ALL
 * so an unregistered command reads as "Perintah tidak dikenal" to anyone
 * who tries it while the flag is false — there is no code path that could
 * accidentally execute it in the default MVP configuration.
 */
if (env.ENABLE_CLEAR_ALL) {
  registerCommand({
    name: 'clear all',
    allowedRoles: ['owner'],
    requiresRegisteredGroup: true,
    requiresPreviewConfirm: true,
    handler: async (ctx) => {
      await logClearAllRequested(pool, {
        performedBy: ctx.userId,
        groupId: ctx.groupId,
        chatId: ctx.chatId,
        messageId: ctx.messageId,
      });

      const payload: ClearAllPayload = {
        kind: 'clear_all',
        chatId: ctx.chatId,
        groupId: ctx.groupId,
        requestedBy: ctx.userId,
      };
      const { sessionId } = await sessionService.createConfirmation({
        userId: ctx.userId,
        groupId: ctx.groupId,
        chatId: ctx.chatId,
        payload,
        ttlMinutes: env.SESSION_EXPIRY_MINUTES,
      });

      return {
        text: 'PERINGATAN: Anda akan menghapus SELURUH pesan di chat ini. Balas (quote) pesan ini dengan !ya untuk konfirmasi atau !cancel untuk membatalkan.',
        pendingSessionId: sessionId,
      };
    },
  });
}
