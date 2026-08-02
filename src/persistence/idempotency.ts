import type { PoolClient, Pool } from 'pg';

/**
 * Inserts a processed_messages row for this WhatsApp message ID.
 * Returns true if this is the first time we've seen the message
 * (safe to proceed), false if it's a redelivery (caller must abort
 * without applying any effect). Call this INSIDE the same transaction
 * as the mutation it guards so a race between two redeliveries can't
 * both pass the check before either commits.
 */
export async function markProcessed(
  client: PoolClient | Pool,
  whatsappMessageId: string,
  chatId: string | null,
  command: string | null,
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO processed_messages (whatsapp_message_id, chat_id, command)
     VALUES ($1, $2, $3)
     ON CONFLICT (whatsapp_message_id) DO NOTHING
     RETURNING id`,
    [whatsappMessageId, chatId, command],
  );
  return (result.rowCount ?? 0) > 0;
}
