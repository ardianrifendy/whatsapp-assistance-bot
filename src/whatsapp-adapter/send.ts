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
      await chat.clearMessages();
      return;
    }

    const limit = action.scope === 'recent' ? (action.limit ?? 20) : 200;
    const messages = await chat.fetchMessages({ limit });

    const toDelete = messages.filter((m: Message) => {
      if (action.scope === 'bot') return m.fromMe;
      if (action.scope === 'saya') return m.author === action.targetSenderJid || m.from === action.targetSenderJid;
      return true; // 'recent': any author, most-recent `limit` messages
    });

    for (const message of toDelete) {
      try {
        await message.delete(true);
      } catch (err) {
        logger.debug(
          { err, messageId: message.id?._serialized },
          'could not delete message (not bot-authored and bot is not a group admin)',
        );
      }
    }
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

    if (!sent?.id?._serialized) {
      throw new Error('client.sendMessage() did not return a sent message with an id');
    }
    const sentMessageId = sent.id._serialized;

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
