import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { createSessionService } from '../../conversation-session/sessionService.real.js';
import { env } from '../../config/env.js';
import { getMenuContent, renderMenuText, resolveAssetPath } from '../menuContent.js';
import type { HelpMenuPayload, MenuTopic } from '../menuContent.js';
import type { HandlerContext } from '../../types/context.js';
import type { CommandResult } from '../../types/command.js';

const sessionService = createSessionService(pool);

/**
 * Shared by "help", "help stok", and "help transaksi" — each just starts a
 * brand new help_menu session on a different initial topic. history is
 * empty for direct topic entry (there was no prior menu message shown to
 * come back to); !back on these replies with "sudah di awal sesi bantuan".
 */
async function startHelpSession(
  topic: MenuTopic,
  ctx: Pick<HandlerContext, 'userId' | 'groupId' | 'chatId' | 'role'>,
): Promise<CommandResult> {
  const content = getMenuContent(topic, ctx.role);
  const payload: HelpMenuPayload = { kind: 'help_menu', topic: content.topic, history: [] };
  const { sessionId } = await sessionService.createConfirmation({
    userId: ctx.userId,
    groupId: ctx.groupId,
    chatId: ctx.chatId,
    payload,
    ttlMinutes: env.SESSION_EXPIRY_MINUTES,
  });
  return {
    text: renderMenuText(content),
    imagePath: resolveAssetPath(content.assetFile),
    pendingSessionId: sessionId,
  };
}

registerCommand({
  name: 'help',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: (ctx) => startHelpSession('main', ctx),
});

registerCommand({
  name: 'help stok',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: (ctx) => startHelpSession('stok', ctx),
});

registerCommand({
  name: 'help transaksi',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: (ctx) => startHelpSession('transaksi', ctx),
});
