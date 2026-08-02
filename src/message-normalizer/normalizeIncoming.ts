import type { Client, Message } from 'whatsapp-web.js';
import type { NormalizedIncomingMessage } from '../command-router/dispatch.js';
import { normalizeWhatsAppNumber } from './normalizeNumber.js';
import { tokenizeCommand } from './tokenizeCommand.js';
import { logger } from '../shared/logger.js';

/**
 * WhatsApp's privacy layer ("LID" / Linked ID) can report a group
 * participant's identity as an opaque `<id>@lid` instead of their real
 * `<number>@c.us`, so `bot_users.whatsapp_number` lookups fail even for a
 * genuinely registered number. Resolve it via the client's own
 * getContactLidAndPhone() before normalizing. Falls back to the raw LID
 * (which normalizeWhatsAppNumber will still turn into a digit string, just
 * one that will never match a real registered number) if resolution fails
 * — logged so the mismatch is diagnosable rather than silent.
 */
async function resolveSenderJid(client: Client, jid: string): Promise<string> {
  if (!jid.endsWith('@lid')) return jid;

  try {
    const [result] = await client.getContactLidAndPhone([jid]);
    if (result?.pn) return result.pn;
    logger.warn({ jid }, 'getContactLidAndPhone returned no phone number for this @lid sender');
  } catch (err) {
    logger.warn({ err, jid }, 'failed to resolve @lid sender to a phone number');
  }
  return jid;
}

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
export async function normalizeIncoming(
  message: Message,
  client: Client,
): Promise<NormalizedIncomingMessage> {
  const whatsappGroupId = message.from.endsWith('@g.us') ? message.from : null;
  const senderJid = await resolveSenderJid(client, message.author ?? message.from);

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
