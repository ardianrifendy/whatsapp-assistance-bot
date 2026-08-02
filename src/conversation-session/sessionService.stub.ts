import type { Pool } from 'pg';
import type {
  ConversationSession,
  CreateConfirmationInput,
  SessionService,
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
 * Minimal DB-backed CRUD implementation of SessionService — no menu
 * navigation, no expiry sweep scheduling. This exists so Worker C can
 * build/test the preview -> confirm flow immediately. Worker D's Stage 2
 * job is to ship the full implementation of this same interface (help
 * menu state machine, quoted-reply UI, scheduled expiry sweep); callers
 * do not change when that lands.
 */
export function createStubSessionService(pool: Pool): SessionService {
  return {
    async createConfirmation(input: CreateConfirmationInput) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO conversation_sessions
           (session_type, user_id, group_id, chat_id, anchor_message_id, payload, status, expires_at)
         VALUES ('confirmation', $1, $2, $3, $4, $5, 'active', $6)
         RETURNING id`,
        [
          input.userId,
          input.groupId,
          input.chatId,
          input.anchorMessageId ?? null,
          JSON.stringify(input.payload),
          minutesFromNow(input.ttlMinutes),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('failed to create confirmation session');
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
