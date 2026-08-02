import type { PoolClient } from 'pg';
import { pool } from './db.js';

/**
 * Runs `fn` inside a single Postgres transaction on a dedicated client.
 * Use this (not the shared `pool`) whenever a batch of statements —
 * e.g. an idempotency insert plus one or more process_stock_movement()
 * calls — must commit or roll back together.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
