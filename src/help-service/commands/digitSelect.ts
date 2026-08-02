import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { createSessionService } from '../../conversation-session/sessionService.real.js';
import { env } from '../../config/env.js';
import { getMenuContent, isHelpMenuPayload, renderMenuText, resolveAssetPath } from '../menuContent.js';
import type { HelpMenuPayload } from '../menuContent.js';
import type { HandlerContext } from '../../types/context.js';
import type { CommandResult } from '../../types/command.js';

const sessionService = createSessionService(pool);

/**
 * Menu selection via digits "1".."9".
 *
 * KNOWN GAP (see final worker report): implementation.md / feature.md say
 * "!back, !cancel, dan 0 selalu tersedia" and describe selection as a bare
 * numeric quoted reply (no "!" prefix). Worker A's tokenizeCommand only
 * treats messages starting with "!" as commands at all — dispatch.ts never
 * sees a bare "0" or bare "2" reply, so this module cannot register a
 * digit-only command that bare numeric replies would reach. As an MVP
 * workaround, digit selection here requires the "!" prefix (!1, !2, ...),
 * and "0" is not wired at all (no digit "0" registered) since a bare "0"
 * can never reach dispatch and "!0" is not part of the spec's vocabulary.
 * The manager needs to resolve this, most likely by having Worker A
 * special-case bare numeric replies to an active session as if they were
 * "!<digit>" before tokenizing, or by deciding menu selection is always
 * written as "!<number>" and updating feature.md/implementation.md to
 * match what's actually reachable.
 */
function makeDigitHandler(digit: string) {
  return async (ctx: HandlerContext): Promise<CommandResult> => {
    const fallback = 'Ketik !help untuk memulai.';
    if (!ctx.sessionId) {
      return { text: fallback };
    }
    const session = await sessionService.getSession(ctx.sessionId);
    if (!session || session.status !== 'active' || session.sessionType !== 'help_menu') {
      return { text: fallback };
    }
    if (!isHelpMenuPayload(session.payload)) {
      return { text: fallback };
    }

    const currentContent = getMenuContent(session.payload.topic, ctx.role);
    const selected = currentContent.options.find((opt) => opt.digit === digit);
    if (!selected) {
      return { text: `Pilihan ${digit} tidak tersedia di menu ini. ${fallback}` };
    }

    await sessionService.completeSession(session.id);

    const nextContent = getMenuContent(selected.target, ctx.role);
    const newHistory = [...session.payload.history, currentContent.topic];
    const payload: HelpMenuPayload = { kind: 'help_menu', topic: nextContent.topic, history: newHistory };
    const { sessionId } = await sessionService.createConfirmation({
      userId: ctx.userId,
      groupId: ctx.groupId,
      chatId: ctx.chatId,
      payload,
      ttlMinutes: env.SESSION_EXPIRY_MINUTES,
    });

    return {
      text: renderMenuText(nextContent),
      imagePath: resolveAssetPath(nextContent.assetFile),
      pendingSessionId: sessionId,
    };
  };
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

for (const digit of DIGITS) {
  registerCommand({
    name: digit,
    allowedRoles: 'any',
    requiresRegisteredGroup: true,
    requiresPreviewConfirm: false,
    handler: makeDigitHandler(digit),
  });
}
