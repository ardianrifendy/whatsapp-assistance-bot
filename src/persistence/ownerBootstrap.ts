import type { Pool } from 'pg';

/**
 * Idempotently ensures every number in OWNER_WHATSAPP_NUMBER exists as an
 * active Owner. Run once on startup so the first Owner(s) exist before any
 * WhatsApp message arrives — no manual SQL required from the human.
 */
export async function bootstrapOwner(pool: Pool, ownerNumbers: string[]): Promise<void> {
  for (const ownerNumber of ownerNumbers) {
    await pool.query(
      `INSERT INTO bot_users (whatsapp_number, is_owner, is_active)
       VALUES ($1, true, true)
       ON CONFLICT (whatsapp_number)
       DO UPDATE SET is_owner = true, is_active = true`,
      [ownerNumber],
    );
  }
}
