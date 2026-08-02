import type {
  DispatchDeps,
  NormalizedIncomingMessage,
  AccessResolution,
} from '../command-router/dispatch.js';
import type { SessionService } from '../types/session.js';

/**
 * Builds the `resolveSessionId` dependency dispatch.ts expects: if the
 * incoming message is a quoted reply and access was granted, look up the
 * active session anchored to that quoted message for this exact
 * User+group pair; otherwise there is no session to resolve.
 *
 * This is the only place quoted-reply -> session routing happens. Both
 * the help-menu navigation (!1..!9, !back) and the generic !cancel command
 * rely on ctx.sessionId being populated here before their handlers run.
 */
export function createSessionResolver(sessionService: SessionService): DispatchDeps['resolveSessionId'] {
  return async (msg: NormalizedIncomingMessage, access: AccessResolution): Promise<string | null> => {
    if (!msg.quotedMessageId || !access.granted || !access.userId || !access.groupId) {
      return null;
    }
    const session = await sessionService.resolveByQuotedReply(
      msg.quotedMessageId,
      access.userId,
      access.groupId,
    );
    return session?.id ?? null;
  };
}
