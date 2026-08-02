import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { createSessionService } from '../../conversation-session/sessionService.real.js';

const sessionService = createSessionService(pool);

/**
 * feature.md / implementation.md: "!back, !cancel, dan 0 selalu tersedia".
 * "0" is the bare-digit exit/cancel shortcut for whatever menu or
 * confirmation session is currently active — same effect as "!cancel".
 * Reachable as a bare "0" reply (see whatsapp-adapter/events.ts's
 * BARE_DIGIT allowance) or as "!0".
 */
registerCommand({
  name: '0',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    if (!ctx.sessionId) {
      return { text: 'Tidak ada sesi aktif untuk ditutup.' };
    }
    const session = await sessionService.getSession(ctx.sessionId);
    if (!session || session.status !== 'active') {
      return { text: 'Tidak ada sesi aktif untuk ditutup.' };
    }
    await sessionService.cancelSession(ctx.sessionId);
    return { text: 'Menu ditutup.' };
  },
});
