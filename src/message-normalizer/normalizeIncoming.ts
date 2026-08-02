import type { Message } from 'whatsapp-web.js';
import type { NormalizedIncomingMessage } from '../command-router/dispatch.js';
import { normalizeWhatsAppNumber } from './normalizeNumber.js';
import { tokenizeCommand } from './tokenizeCommand.js';
import { logger } from '../shared/logger.js';

/**
 * whatsapp-web.js occasionally hands back a Message whose `id._serialized`
 * is empty (a known quirk of scraping WhatsApp Web's internal store via
 * puppeteer — some internal message shapes don't carry it). Since
 * processed_messages.whatsapp_message_id is NOT NULL (it's our idempotency
 * key), a missing ID must never reach the database as null. Fall back to
 * `id.id` (the unserialized form some message shapes still carry), then to
 * a composite of sender+timestamp+body as a last resort — not as strong an
 * idempotency key as the real WhatsApp ID, but still stable across a
 * genuine redelivery of the same message.
 */
function resolveMessageId(message: Message): string {
  const serialized = message.id?._serialized;
  if (serialized) return serialized;

  const raw = (message.id as { id?: string } | undefined)?.id;
  if (raw) {
    logger.warn({ chatId: message.from }, 'message.id._serialized missing, falling back to message.id.id');
    return raw;
  }

  logger.warn(
    { chatId: message.from, timestamp: message.timestamp },
    'message.id fully missing, falling back to a synthetic composite id',
  );
  return `synthetic:${message.from}:${message.timestamp}:${message.body.length}`;
}

/**
 * Glue function: takes a raw whatsapp-web.js `Message` (already filtered by
 * events.ts to be a group message starting with "!") and produces the
 * `NormalizedIncomingMessage` shape the command-router pipeline expects.
 */
export async function normalizeIncoming(message: Message): Promise<NormalizedIncomingMessage> {
  const whatsappGroupId = message.from.endsWith('@g.us') ? message.from : null;
  const senderJid = message.author ?? message.from;

  const quotedMessageId = message.hasQuotedMsg
    ? ((await message.getQuotedMessage())?.id?._serialized ?? null)
    : null;

  const { command, args, batchLines } = tokenizeCommand(message.body);

  return {
    messageId: resolveMessageId(message),
    chatId: message.from,
    whatsappGroupId,
    senderJid,
    senderNumber: normalizeWhatsAppNumber(senderJid),
    quotedMessageId,
    command,
    args,
    rawBody: message.body,
    ...(batchLines !== undefined ? { batchLines } : {}),
  };
}
