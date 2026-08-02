import type { Client, Message } from 'whatsapp-web.js';
import type { NormalizedIncomingMessage } from '../command-router/dispatch.js';
import { normalizeIncoming } from '../message-normalizer/normalizeIncoming.js';
import { logger } from '../shared/logger.js';

export type IncomingMessageHandler = (msg: NormalizedIncomingMessage) => Promise<void>;

/**
 * Wires `message_create` (not plain `message`) so we see everything,
 * including messages the bot's own account sends -- which we filter out
 * here via `fromMe`. Worker C/D's confirmation flow gets the sent message
 * ID directly from send.ts's return value, not by reading it back off this
 * event stream.
 *
 * Per PRD "Grup adalah konteks gudang", only group messages are processed;
 * DMs are dropped at this layer. Non-command bodies are dropped before
 * normalization, EXCEPT a bare single digit (e.g. a quoted-reply of just
 * "0" or "2") — feature.md/implementation.md specify menu navigation via
 * a bare numeric reply, not a "!"-prefixed one, so that one shape is let
 * through unprefixed. tokenizeCommand.ts already handles a body with no
 * "!" prefix identically to one with it (it only strips the prefix if
 * present), so no normalizer change was needed for this.
 */
const BARE_DIGIT = /^[0-9]$/;
export function registerMessageHandler(client: Client, handler: IncomingMessageHandler): void {
  client.on('message_create', (message: Message) => {
    void handleMessageCreate(message, handler);
  });
}

async function handleMessageCreate(message: Message, handler: IncomingMessageHandler): Promise<void> {
  try {
    if (message.fromMe) {
      logger.debug({ messageId: message.id?._serialized }, 'ignoring message sent by the bot itself');
      return;
    }

    if (!message.from.endsWith('@g.us')) {
      logger.debug({ messageId: message.id?._serialized, from: message.from }, 'ignoring non-group message');
      return;
    }

    if (!message.body.startsWith('!') && !BARE_DIGIT.test(message.body.trim())) {
      logger.debug({ messageId: message.id?._serialized }, 'ignoring non-command message');
      return;
    }

    const normalized = await normalizeIncoming(message);
    await handler(normalized);
  } catch (err) {
    logger.error({ err, messageId: message.id?._serialized }, 'failed to process incoming message');
  }
}
