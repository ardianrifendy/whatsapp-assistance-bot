import type { Pool, PoolClient } from 'pg';
import { logAudit } from '../audit-service/auditService.js';
import type { CommandResult } from '../types/command.js';

/**
 * ============================================================================
 * WhatsApp message deletion — resolved during the manager's integration pass
 * ============================================================================
 * Actually deleting messages requires the live whatsapp-web.js `Chat`/
 * `Message` objects, which only src/whatsapp-adapter touches. This module
 * records the audit_logs entry and returns a CommandResult with the
 * `clearAction` field (src/types/command.ts) populated; whatsapp-adapter's
 * `createSendResponse` (src/whatsapp-adapter/send.ts) inspects that field
 * after delivering the text reply and performs the actual
 * fetchMessages/delete calls with its live Chat object.
 */

export type ClearScope = 'bot' | 'saya' | 'recent' | 'all';

/** Payload stored in conversation_sessions.payload for a pending "!clear recent" confirmation. */
export interface ClearRecentPayload {
  kind: 'clear_recent';
  chatId: string;
  groupId: string;
  requestedBy: string;
  limit: number;
}

/** Payload stored in conversation_sessions.payload for a pending "!clear all" confirmation. */
export interface ClearAllPayload {
  kind: 'clear_all';
  chatId: string;
  groupId: string;
  requestedBy: string;
}

export function isClearRecentPayload(payload: unknown): payload is ClearRecentPayload {
  return !!payload && typeof payload === 'object' && (payload as { kind?: unknown }).kind === 'clear_recent';
}

export function isClearAllPayload(payload: unknown): payload is ClearAllPayload {
  return !!payload && typeof payload === 'object' && (payload as { kind?: unknown }).kind === 'clear_all';
}

interface AuditParams {
  performedBy: string;
  groupId: string;
  chatId: string;
  messageId?: string;
}

/** "!clear bot" executes immediately (no confirmation) — only the bot's own messages are at risk. */
export async function logClearBot(db: Pool | PoolClient, params: AuditParams): Promise<void> {
  await logAudit(db, {
    action: 'clear_bot',
    targetType: 'chat',
    targetId: params.chatId,
    performedBy: params.performedBy,
    groupId: params.groupId,
    whatsappMessageId: params.messageId,
  });
}

/** "!clear saya" executes immediately (no confirmation) — only the invoking User's own messages are at risk. */
export async function logClearSaya(db: Pool | PoolClient, params: AuditParams): Promise<void> {
  await logAudit(db, {
    action: 'clear_saya',
    targetType: 'chat',
    targetId: params.chatId,
    performedBy: params.performedBy,
    groupId: params.groupId,
    whatsappMessageId: params.messageId,
  });
}

/** Logged when "!clear recent <n>" is requested, before confirmation. */
export async function logClearRecentRequested(
  db: Pool | PoolClient,
  params: AuditParams & { limit: number },
): Promise<void> {
  await logAudit(db, {
    action: 'clear_recent_requested',
    targetType: 'chat',
    targetId: params.chatId,
    performedBy: params.performedBy,
    groupId: params.groupId,
    afterData: { limit: params.limit },
    whatsappMessageId: params.messageId,
  });
}

/** Logged when "!clear all" is requested, before confirmation. Only reachable when ENABLE_CLEAR_ALL=true. */
export async function logClearAllRequested(db: Pool | PoolClient, params: AuditParams): Promise<void> {
  await logAudit(db, {
    action: 'clear_all_requested',
    targetType: 'chat',
    targetId: params.chatId,
    performedBy: params.performedBy,
    groupId: params.groupId,
    whatsappMessageId: params.messageId,
  });
}

/**
 * Completes a confirmed "!clear recent" session.
 *
 * INTEGRATION GAP (cross-domain confirmation dispatch, see report): the
 * generic "!ya" confirmation command belongs to Worker C (inventory
 * domain) per the shared preview/confirm convention, and today it only
 * knows how to interpret inventory movement payloads. For "!clear recent"
 * to actually run when the User replies "!ya", Worker C's (or the
 * manager's) !ya handler needs to branch on `payload.kind` and call this
 * function when `payload.kind === 'clear_recent'` — this function is
 * exported specifically so that wiring is a one-line call once added,
 * without this worker needing to touch the !ya command it doesn't own.
 */
export async function completeClearRecent(
  db: Pool | PoolClient,
  payload: ClearRecentPayload,
  messageId?: string,
): Promise<CommandResult> {
  await logAudit(db, {
    action: 'clear_recent_confirmed',
    targetType: 'chat',
    targetId: payload.chatId,
    performedBy: payload.requestedBy,
    groupId: payload.groupId,
    afterData: { limit: payload.limit },
    whatsappMessageId: messageId,
  });
  return {
    text: `Konfirmasi diterima: menghapus ${payload.limit} pesan terakhir dari chat ini.`,
    clearAction: { scope: 'recent', limit: payload.limit },
  };
}

/** Completes a confirmed "!clear all" session. Same cross-domain dispatch gap as completeClearRecent above. */
export async function completeClearAll(
  db: Pool | PoolClient,
  payload: ClearAllPayload,
  messageId?: string,
): Promise<CommandResult> {
  await logAudit(db, {
    action: 'clear_all_confirmed',
    targetType: 'chat',
    targetId: payload.chatId,
    performedBy: payload.requestedBy,
    groupId: payload.groupId,
    whatsappMessageId: messageId,
  });
  return {
    text: 'Konfirmasi diterima: menghapus seluruh pesan di chat ini.',
    clearAction: { scope: 'all' },
  };
}
