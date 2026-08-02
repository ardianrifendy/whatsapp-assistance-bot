import type { Message } from 'whatsapp-web.js';
import type { NormalizedIncomingMessage } from '../command-router/dispatch.js';
import { normalizeWhatsAppNumber } from './normalizeNumber.js';
import { tokenizeCommand } from './tokenizeCommand.js';

/**
 * Glue function: takes a raw whatsapp-web.js `Message` (already filtered by
 * events.ts to be a group message starting with "!") and produces the
 * `NormalizedIncomingMessage` shape the command-router pipeline expects.
 */
export async function normalizeIncoming(message: Message): Promise<NormalizedIncomingMessage> {
  const whatsappGroupId = message.from.endsWith('@g.us') ? message.from : null;
  const senderJid = message.author ?? message.from;

  const quotedMessageId = message.hasQuotedMsg
    ? ((await message.getQuotedMessage())?.id._serialized ?? null)
    : null;

  const { command, args, batchLines } = tokenizeCommand(message.body);

  return {
    messageId: message.id._serialized,
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
