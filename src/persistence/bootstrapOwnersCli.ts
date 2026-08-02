import { pool } from './db.js';
import { bootstrapOwner } from './ownerBootstrap.js';
import { env } from '../config/env.js';

async function main(): Promise<void> {
  await bootstrapOwner(pool, env.OWNER_WHATSAPP_NUMBER);
  console.log('Owners bootstrapped:', env.OWNER_WHATSAPP_NUMBER);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
