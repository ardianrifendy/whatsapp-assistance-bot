import fs from 'node:fs';
import type { Client, Message, MessageSendOptions } from 'whatsapp-web.js';
// See client.ts for why this must be a default import + destructure
// rather than a named import (whatsapp-web.js is CommonJS).
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;
import type { NormalizedIncomingMessage } from '../command-router/dispatch.js';
import type { CommandResult } from '../types/command.js';
import { logger } from '../shared/logger.js';

type ClearAction = NonNullable<CommandResult['clearAction']>;

// A genuine WhatsApp serialized message ID looks like
// "false_120363xxxxx@g.us_3EB0xxxxxxxxxxxx". message-normalizer falls back
// to a non-serialized raw id (or a synthetic one) when the real one is
// missing (see normalizeIncoming.ts's resolveMessageId) — that fallback is
// fine for our own idempotency key, but whatsapp-web.js's sendMessage()
// silently fails (resolves undefined instead of throwing) when handed an
// invalid quotedMessageId. Only pass it through when it matches the real
// shape; otherwise send a plain new message rather than crash the command.
const SERIALIZED_MESSAGE_ID_PATTERN = /^(true|false)_[^_]+_.+$/;

function buildReplyOptions(msg: NormalizedIncomingMessage): MessageSendOptions {
  if (SERIALIZED_MESSAGE_ID_PATTERN.test(msg.messageId)) {
    return { quotedMessageId: msg.messageId };
  }
  logger.debug({ messageId: msg.messageId }, 'messageId is not a real serialized id, sending without a quote');
  return {};
}

/**
 * Executes the actual WhatsApp-side deletion requested by
 * chat-moderation-service (src/chat-moderation-service) via
 * CommandResult.clearAction — the only layer with a live Chat/Message
 * reference. Best-effort: WhatsApp only allows deleting messages the bot
 * account itself sent (or any message if the bot is a group admin), so
 * per-message delete failures are logged at debug level and skipped
 * rather than surfaced as an error to the group.
 */
async function applyClearAction(
  client: Client,
  msg: NormalizedIncomingMessage,
  action: ClearAction,
): Promise<void> {
  try {
    const chat = await client.getChatById(msg.chatId);

    if (action.scope === 'all') {
      try {
        await chat.clearMessages();
        return;
      } catch (err) {
        // Observed to fail with an internal WhatsApp Web scraping-layer
        // error in this environment (same family as the message-id
        // quirks elsewhere in this codebase). Fall through to the
        // per-message delete path below instead of silently doing
        // nothing — it's slower but uses the primitive that has
        // actually worked for the other clear scopes.
        logger.warn(
          { err, chatId: msg.chatId },
          'chat.clearMessages() failed, falling back to per-message delete',
        );
      }
    }

    const limit = action.scope === 'recent' ? (action.limit ?? 20) : 1000;
    const messages = await chat.fetchMessages({ limit });

    const toDelete = messages.filter((m: Message) => {
      if (action.scope === 'bot') return m.fromMe;
      if (action.scope === 'saya') return m.author === action.targetSenderJid || m.from === action.targetSenderJid;
      return true; // 'recent' and the 'all' fallback: every fetched message
    });

    let deletedCount = 0;
    for (const message of toDelete) {
      try {
        await message.delete(true);
        deletedCount += 1;
      } catch (err) {
        logger.debug(
          { err, messageId: message.id?._serialized },
          'could not delete message (not bot-authored and bot is not a group admin)',
        );
      }
    }
    logger.info(
      { chatId: msg.chatId, action, attempted: toDelete.length, deletedCount },
      'clearAction per-message delete finished',
    );
  } catch (err) {
    logger.error({ err, chatId: msg.chatId, action }, 'failed to execute clearAction');
  }
}

/**
 * Factories bound to the live Client instance, matching the exact function
 * shapes DispatchDeps.sendResponse / sendError expect. Kept as factories
 * (rather than importing a module-level client singleton) so the manager
 * can wire them up explicitly during the integration pass in index.ts.
 *
 * Per PRD: "Response bot selalu berupa pesan baru yang me-reply konteks
 * sebelumnya" -> every response is a NEW message that quote-replies the
 * triggering message, never an edit of a previous message.
 */
export function createSendResponse(
  client: Client,
): (msg: NormalizedIncomingMessage, result: CommandResult) => Promise<{ sentMessageId: string }> {
  return async (msg, result) => {
    const options = buildReplyOptions(msg);

    // Help images (assets/help/*.png) are static files a human must supply
    // separately (see instruksi.txt) — until they exist, degrade to a
    // text-only reply instead of failing the whole command.
    let sent;
    if (result.imagePath && fs.existsSync(result.imagePath)) {
      try {
        const media = MessageMedia.fromFilePath(result.imagePath);
        sent = await client.sendMessage(msg.chatId, media, { ...options, caption: result.text });
      } catch (err) {
        logger.warn({ err, imagePath: result.imagePath }, 'failed to attach image, sending text only');
        sent = await client.sendMessage(msg.chatId, result.text, options);
      }
    } else {
      if (result.imagePath) {
        logger.warn({ imagePath: result.imagePath }, 'help image not found, sending text only');
      }
      sent = await client.sendMessage(msg.chatId, result.text, options);
    }

    // As with incoming messages (see normalizeIncoming.ts), whatsapp-web.js
    // sometimes resolves sendMessage() without a proper Message wrapper
    // (missing/empty id) even though the message itself was actually
    // delivered — the send call completing is what matters to the user, so
    // this must degrade to a synthetic id (only used internally to anchor a
    // pending confirmation session) rather than report the command as
    // failed for a reply that likely already reached the chat.
    let sentMessageId = sent?.id?._serialized;
    if (!sentMessageId) {
      sentMessageId = `synthetic-sent:${msg.chatId}:${Date.now()}`;
      logger.warn(
        { chatId: msg.chatId, command: msg.command, sentMessageId },
        'sendMessage() returned no message id; message was likely still delivered, using a synthetic id',
      );
    }

    if (result.clearAction) {
      await applyClearAction(client, msg, result.clearAction);
    }

    return { sentMessageId };
  };
}

export function createSendError(
  client: Client,
): (msg: NormalizedIncomingMessage, text: string) => Promise<void> {
  return async (msg, text) => {
    await client.sendMessage(msg.chatId, text, buildReplyOptions(msg));
  };
}
