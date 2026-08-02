import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { createSessionService } from '../../conversation-session/sessionService.real.js';

const sessionService = createSessionService(pool);

/**
 * Generic cancel, shared across BOTH session flavors: a help_menu session
 * (abandon the menu) and a confirmation session (abort a pending
 * !masuk/!keluar/... preview or a pending !clear recent / !clear all).
 * ctx.sessionId is populated by resolveSessionId.ts whenever this message
 * quote-replies an active session's anchor, regardless of session_type, so
 * this one handler covers every case per the shared preview/confirm
 * convention.
 */
registerCommand({
  name: 'cancel',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    if (!ctx.sessionId) {
      return { text: 'Tidak ada sesi aktif untuk dibatalkan.' };
    }
    const session = await sessionService.getSession(ctx.sessionId);
    if (!session || session.status !== 'active') {
      return { text: 'Tidak ada sesi aktif untuk dibatalkan.' };
    }
    await sessionService.cancelSession(ctx.sessionId);
    return { text: 'Sesi dibatalkan.' };
  },
});
