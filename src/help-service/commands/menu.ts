import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { createSessionService } from '../../conversation-session/sessionService.real.js';
import { env } from '../../config/env.js';
import { getMenuContent, renderMenuText, resolveAssetPath } from '../menuContent.js';
import type { HelpMenuPayload } from '../menuContent.js';

const sessionService = createSessionService(pool);

/** "!menu" — always jumps back to the top-level main menu, starting a fresh session. */
registerCommand({
  name: 'menu',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const content = getMenuContent('main', ctx.role);
    const payload: HelpMenuPayload = { kind: 'help_menu', topic: 'main', history: [] };
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
  },
});
