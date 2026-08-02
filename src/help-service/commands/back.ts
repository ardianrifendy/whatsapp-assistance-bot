import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { createSessionService } from '../../conversation-session/sessionService.real.js';
import { env } from '../../config/env.js';
import { getMenuContent, isHelpMenuPayload, renderMenuText, resolveAssetPath } from '../menuContent.js';
import type { HelpMenuPayload } from '../menuContent.js';

const sessionService = createSessionService(pool);

const NO_ACTIVE_MENU_TEXT = 'Tidak ada menu bantuan aktif. Ketik !help untuk memulai.';

/**
 * "!back" only makes sense for help_menu sessions (menu navigation);
 * confirmation sessions (Worker C's previews, !clear recent/all) don't
 * have a "previous level" concept and are handled by !cancel instead.
 */
registerCommand({
  name: 'back',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    if (!ctx.sessionId) {
      return { text: NO_ACTIVE_MENU_TEXT };
    }
    const session = await sessionService.getSession(ctx.sessionId);
    if (!session || session.status !== 'active' || session.sessionType !== 'help_menu') {
      return { text: NO_ACTIVE_MENU_TEXT };
    }
    if (!isHelpMenuPayload(session.payload)) {
      return { text: NO_ACTIVE_MENU_TEXT };
    }

    const history = session.payload.history;
    const previousTopic = history[history.length - 1];
    if (!previousTopic) {
      return { text: 'Sudah berada di menu utama. Ketik !cancel untuk mengakhiri sesi bantuan.' };
    }

    await sessionService.completeSession(session.id);

    const newHistory = history.slice(0, -1);
    const content = getMenuContent(previousTopic, ctx.role);
    const payload: HelpMenuPayload = { kind: 'help_menu', topic: content.topic, history: newHistory };
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
