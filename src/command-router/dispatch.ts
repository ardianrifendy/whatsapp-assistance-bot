import type { Pool, PoolClient } from 'pg';
import type { HandlerContext, Role } from '../types/context.js';
import type { CommandResult } from '../types/command.js';
import { getCommand } from './registry.js';
import { markProcessed } from '../persistence/idempotency.js';
import { UserFacingError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

/**
 * A message already normalized by Worker A (message-normalizer) — JID,
 * numbers, chat/group IDs resolved, command text tokenized.
 */
export interface NormalizedIncomingMessage {
  messageId: string;
  chatId: string;
  whatsappGroupId: string | null; // null if not sent in a group -> dropped before dispatch
  senderJid: string;
  senderNumber: string;
  quotedMessageId: string | null;
  command: string; // e.g. "stok list"
  args: string[];
  rawBody: string;
  batchLines?: string[];
}

/** Result of Worker B's access-control gate. */
export interface AccessResolution {
  granted: boolean;
  reason?: string; // user-facing rejection message when granted = false
  userId?: string;
  role?: Role;
  isOwner?: boolean;
  groupId?: string; // bot_groups.id (not the raw WhatsApp group id)
  warehouseId?: string;
}

/**
 * Dependencies supplied by the manager during the integration pass, once
 * Workers A/B/D land. Kept as injected functions (not direct imports) so
 * this module has zero compile-time dependency on worker-owned files and
 * can be unit-tested with fakes before those files exist.
 */
export interface DispatchDeps {
  /** Worker B: resolves group/user/role, applies the !grup daftar owner-bypass. */
  resolveAccess: (msg: NormalizedIncomingMessage, command: string) => Promise<AccessResolution>;
  /** Worker D: resolves an active session if this message is a quoted reply. */
  resolveSessionId: (msg: NormalizedIncomingMessage, access: AccessResolution) => Promise<string | null>;
  /** Worker A: sends the command's response back into the chat; returns the sent WhatsApp message ID. */
  sendResponse: (msg: NormalizedIncomingMessage, result: CommandResult) => Promise<{ sentMessageId: string }>;
  /** Worker A: sends a friendly rejection/error back into the chat. */
  sendError: (msg: NormalizedIncomingMessage, text: string) => Promise<void>;
  /** Worker D (or the stub): attaches the anchor once the preview message ID is known. */
  attachAnchor: (sessionId: string, anchorMessageId: string) => Promise<void>;
}

function roleAllowed(role: Role, allowed: CommandResultAllowedRoles): boolean {
  if (allowed === 'any') return true;
  return allowed.includes(role);
}

type CommandResultAllowedRoles = HandlerContext['role'][] | 'any';

/**
 * Full message-processing pipeline (implementation.md "Urutan pemrosesan
 * pesan"): idempotency -> access gate -> session resolution -> registry
 * lookup -> role check -> handler -> response. Batch/preview-confirm
 * branching lives inside each command's own handler (inventory-service
 * for mutations, help/session-service for confirmation UX), not here.
 */
export async function dispatch(
  client: Pool | PoolClient,
  msg: NormalizedIncomingMessage,
  deps: DispatchDeps,
): Promise<void> {
  if (!msg.whatsappGroupId) {
    logger.debug({ messageId: msg.messageId }, 'dropping non-group message');
    return;
  }

  const isNew = await markProcessed(client, msg.messageId, msg.chatId, msg.command);
  if (!isNew) {
    logger.debug({ messageId: msg.messageId }, 'duplicate message, skipping');
    return;
  }

  const def = getCommand(msg.command);
  if (!def) {
    await deps.sendError(msg, `Perintah tidak dikenal: !${msg.command}. Ketik !help untuk bantuan.`);
    return;
  }

  const access = await deps.resolveAccess(msg, msg.command);
  if (!access.granted || !access.userId || !access.role) {
    await deps.sendError(msg, access.reason ?? 'Anda tidak memiliki akses untuk perintah ini.');
    return;
  }

  if (def.requiresRegisteredGroup && !access.groupId) {
    await deps.sendError(msg, 'Grup ini belum terdaftar. Hubungi Owner untuk mendaftarkan grup.');
    return;
  }

  if (!roleAllowed(access.role, def.allowedRoles)) {
    await deps.sendError(msg, 'Anda tidak memiliki akses untuk perintah ini.');
    return;
  }

  const sessionId = await deps.resolveSessionId(msg, access);

  const ctx: HandlerContext = {
    messageId: msg.messageId,
    chatId: msg.chatId,
    groupId: access.groupId ?? '',
    warehouseId: access.warehouseId ?? '',
    senderJid: msg.senderJid,
    userId: access.userId,
    role: access.role,
    isOwner: access.isOwner ?? false,
    quotedMessageId: msg.quotedMessageId,
    sessionId,
    args: msg.args,
    rawBody: msg.rawBody,
    ...(msg.batchLines !== undefined ? { batchLines: msg.batchLines } : {}),
  };

  try {
    const result = await def.handler(ctx);
    const { sentMessageId } = await deps.sendResponse(msg, result);
    if (result.pendingSessionId) {
      await deps.attachAnchor(result.pendingSessionId, sentMessageId);
    }
  } catch (err) {
    if (err instanceof UserFacingError) {
      await deps.sendError(msg, err.message);
      return;
    }
    logger.error({ err, command: msg.command, messageId: msg.messageId }, 'command handler failed');
    await deps.sendError(msg, 'Terjadi kesalahan saat memproses perintah. Silakan coba lagi.');
  }
}
