import type { Pool, PoolClient } from 'pg';

export interface ActiveBotUser {
  id: string;
  isOwner: boolean;
}

interface BotUserRow {
  id: string;
  is_owner: boolean;
  is_active: boolean;
}

/**
 * Returns the sender's bot_users row only if it exists AND is active.
 * `whatsappNumber` must already be normalized (digits only) — dispatch
 * hands us `msg.senderNumber`, which message-normalizer already ran
 * through normalizeWhatsAppNumber().
 */
export async function findActiveUserByNumber(
  client: Pool | PoolClient,
  whatsappNumber: string,
): Promise<ActiveBotUser | null> {
  const result = await client.query<BotUserRow>(
    `SELECT id, is_owner, is_active FROM bot_users WHERE whatsapp_number = $1`,
    [whatsappNumber],
  );
  const row = result.rows[0];
  if (!row || !row.is_active) return null;
  return { id: row.id, isOwner: row.is_owner };
}
