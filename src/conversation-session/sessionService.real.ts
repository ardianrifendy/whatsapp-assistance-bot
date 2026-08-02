import type { Pool } from 'pg';
import type {
  ConversationSession,
  CreateConfirmationInput,
  SessionService,
  SessionType,
} from '../types/session.js';
import { minutesFromNow } from '../shared/time.js';

interface SessionRow {
  id: string;
  session_type: string;
  user_id: string;
  group_id: string;
  chat_id: string;
  anchor_message_id: string | null;
  payload: unknown;
  status: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

function toSession(row: SessionRow): ConversationSession {
  return {
    id: row.id,
    sessionType: row.session_type as ConversationSession['sessionType'],
    userId: row.user_id,
    groupId: row.group_id,
    chatId: row.chat_id,
    anchorMessageId: row.anchor_message_id,
    payload: row.payload,
    status: row.status as ConversationSession['status'],
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Pragmatic reuse of the single `createConfirmation` method to create BOTH
 * session flavors that the `conversation_sessions.session_type` column
 * supports.
 *
 * The shared `SessionService` interface (src/types/session.ts, manager-owned)
 * only exposes one creation method, named for the confirmation-preview use
 * case Worker C's inventory domain needs. Widening the interface with a
 * second "createHelpMenu"-style method is out of this worker's scope (it
 * would ripple into the stub and into Worker C's already-in-flight code).
 *
 * Instead, this implementation inspects `input.payload` for a `kind`
 * discriminator:
 *   - `payload.kind === 'help_menu'`  -> writes session_type = 'help_menu'
 *   - anything else (including plain inventory preview payloads that have
 *     no `kind` field at all, e.g. Worker C's `{ movementType, lines, ... }`)
 *     -> writes session_type = 'confirmation'
 *
 * Every other behavior (expiry, quoted-reply resolution, cancel/complete,
 * sweeping) is identical for both flavors — only the stored discriminator
 * value differs. Callers that want a help_menu session simply include
 * `kind: 'help_menu'` inside the payload they pass to `createConfirmation`.
 */
export function resolveSessionType(payload: unknown): SessionType {
  if (typeof payload === 'object' && payload !== null && 'kind' in payload) {
    const kind = (payload as { kind?: unknown }).kind;
    if (kind === 'help_menu') return 'help_menu';
  }
  return 'confirmation';
}

/**
 * Full SessionService implementation backed by Postgres. Same public
 * contract as sessionService.stub.ts (Worker C's code never needs to
 * change when this replaces the stub at integration time), but:
 *   - writes the correct session_type via resolveSessionType() above so
 *     help_menu sessions (Worker D) and confirmation sessions (Worker C,
 *     and this worker's own !clear recent / !clear all) can share one
 *     table and one creation method;
 *   - resolveByQuotedReply strictly filters by user_id AND group_id AND
 *     'active' status AND non-expired, so a session can only ever be
 *     resumed by the same User in the same group it was created in, and
 *     never after expiry (this is what makes menu navigation and
 *     confirm/cancel routing safe against cross-user/cross-group replay);
 *   - sweepExpired is meant to be invoked periodically by
 *     conversation-session/expirySweep.ts, not on every request.
 */
export function createSessionService(pool: Pool): SessionService {
  return {
    async createConfirmation(input: CreateConfirmationInput) {
      const sessionType = resolveSessionType(input.payload);
      const result = await pool.query<{ id: string }>(
        `INSERT INTO conversation_sessions
           (session_type, user_id, group_id, chat_id, anchor_message_id, payload, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
         RETURNING id`,
        [
          sessionType,
          input.userId,
          input.groupId,
          input.chatId,
          input.anchorMessageId ?? null,
          JSON.stringify(input.payload),
          minutesFromNow(input.ttlMinutes),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('failed to create conversation session');
      return { sessionId: row.id, anchorMessageId: input.anchorMessageId };
    },

    async getSession(sessionId: string) {
      const result = await pool.query<SessionRow>(
        `SELECT * FROM conversation_sessions WHERE id = $1`,
        [sessionId],
      );
      const row = result.rows[0];
      return row ? toSession(row) : null;
    },

    async resolveByQuotedReply(quotedMessageId: string, userId: string, groupId: string) {
      const result = await pool.query<SessionRow>(
        `SELECT * FROM conversation_sessions
         WHERE anchor_message_id = $1 AND user_id = $2 AND group_id = $3
           AND status = 'active' AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1`,
        [quotedMessageId, userId, groupId],
      );
      const row = result.rows[0];
      return row ? toSession(row) : null;
    },

    async getActiveSessionForUser(userId: string, groupId: string) {
      const result = await pool.query<SessionRow>(
        `SELECT * FROM conversation_sessions
         WHERE user_id = $1 AND group_id = $2
           AND status = 'active' AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, groupId],
      );
      const row = result.rows[0];
      return row ? toSession(row) : null;
    },

    async completeSession(sessionId: string) {
      await pool.query(
        `UPDATE conversation_sessions SET status = 'completed' WHERE id = $1 AND status = 'active'`,
        [sessionId],
      );
    },

    async cancelSession(sessionId: string) {
      await pool.query(
        `UPDATE conversation_sessions SET status = 'cancelled' WHERE id = $1 AND status = 'active'`,
        [sessionId],
      );
    },

    async attachAnchor(sessionId: string, anchorMessageId: string) {
      await pool.query(`UPDATE conversation_sessions SET anchor_message_id = $1 WHERE id = $2`, [
        anchorMessageId,
        sessionId,
      ]);
    },

    async sweepExpired() {
      const result = await pool.query(
        `UPDATE conversation_sessions
         SET status = 'expired'
         WHERE status = 'active' AND expires_at <= now()`,
      );
      return result.rowCount ?? 0;
    },
  };
}
