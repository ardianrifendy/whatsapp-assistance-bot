export type SessionType = 'help_menu' | 'confirmation';
export type SessionStatus = 'active' | 'expired' | 'completed' | 'cancelled';

export interface ConversationSession {
  id: string;
  sessionType: SessionType;
  userId: string;
  groupId: string;
  chatId: string;
  /** WhatsApp message ID of the bot's own message a quoted reply must reference. */
  anchorMessageId: string | null;
  payload: unknown;
  status: SessionStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConfirmationInput {
  userId: string;
  groupId: string;
  chatId: string;
  payload: unknown;
  ttlMinutes: number;
  anchorMessageId?: string;
}

/**
 * Contract implemented first by a minimal manager-owned stub (Stage 1, plain
 * CRUD, no menu logic) so Worker C can build the preview/confirm flow
 * immediately, then replaced by Worker D's full implementation (menu
 * state machine, quoted-reply resolution UI, expiry sweep). Callers never
 * change when D's implementation lands.
 */
export interface SessionService {
  createConfirmation(
    input: CreateConfirmationInput,
  ): Promise<{ sessionId: string; anchorMessageId?: string }>;
  getSession(sessionId: string): Promise<ConversationSession | null>;
  resolveByQuotedReply(
    quotedMessageId: string,
    userId: string,
    groupId: string,
  ): Promise<ConversationSession | null>;
  /**
   * Fallback for when quote-reply resolution is unavailable or fails
   * (observed WhatsApp Web / whatsapp-web.js quoting instability — see
   * resolveSessionId.ts): the most recent active, non-expired session for
   * this exact user+group, regardless of anchor. Safe because it's only
   * ever consulted by session-dependent commands (!ya, !cancel, digit
   * menu selection) that are meaningless without an active session
   * anyway, and a user only ever has one meaningfully "current" session.
   */
  getActiveSessionForUser(userId: string, groupId: string): Promise<ConversationSession | null>;
  completeSession(sessionId: string): Promise<void>;
  cancelSession(sessionId: string): Promise<void>;
  /**
   * Sets anchor_message_id after the bot's preview message has actually
   * been sent (the WhatsApp message ID doesn't exist until then — see
   * CommandResult.pendingSessionId).
   */
  attachAnchor(sessionId: string, anchorMessageId: string): Promise<void>;
  /** Marks expired active sessions as 'expired'; returns count swept. */
  sweepExpired(): Promise<number>;
}
