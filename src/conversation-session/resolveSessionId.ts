import type {
  DispatchDeps,
  NormalizedIncomingMessage,
  AccessResolution,
} from '../command-router/dispatch.js';
import type { SessionService } from '../types/session.js';

/**
 * Builds the `resolveSessionId` dependency dispatch.ts expects. Tries the
 * precise route first — if the message is a quoted reply, resolve the
 * session anchored to that exact quote — then falls back to "the most
 * recent active session for this user+group" (SessionService.
 * getActiveSessionForUser) when that doesn't resolve. The fallback also
 * covers messages with no quote at all.
 *
 * The fallback exists because Message.getQuotedMessage() has been observed
 * to fail (an internal whatsapp-web.js/WhatsApp Web scraping-layer bug —
 * see normalizeIncoming.ts's resolveQuotedMessageId) specifically for
 * messages the bot itself sent, which is exactly the message every
 * confirmation/menu reply quotes. Without this fallback, !ya/!cancel/digit
 * menu selection would be unusable whenever that bug is triggered. It's
 * safe broadly: only session-dependent commands (!ya, !cancel, !0-!9)
 * ever consult ctx.sessionId, and a user only ever has one meaningfully
 * "current" session at a time.
 *
 * Both the help-menu navigation (!1..!9, !back) and the generic !cancel
 * command rely on ctx.sessionId being populated here before their
 * handlers run.
 */
export function createSessionResolver(sessionService: SessionService): DispatchDeps['resolveSessionId'] {
  return async (msg: NormalizedIncomingMessage, access: AccessResolution): Promise<string | null> => {
    if (!access.granted || !access.userId || !access.groupId) {
      return null;
    }

    if (msg.quotedMessageId) {
      const session = await sessionService.resolveByQuotedReply(
        msg.quotedMessageId,
        access.userId,
        access.groupId,
      );
      if (session) return session.id;
    }

    const fallback = await sessionService.getActiveSessionForUser(access.userId, access.groupId);
    return fallback?.id ?? null;
  };
}
