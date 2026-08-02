import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TZ: z.string().default('Asia/Jakarta'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HEALTHCHECK_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // Comma-separated list of one or more normalized WhatsApp numbers
  // (digits only, no "+", no "@c.us") to bootstrap as active Owners on
  // startup, e.g. "628111,628222".
  OWNER_WHATSAPP_NUMBER: z
    .string()
    .min(8, 'OWNER_WHATSAPP_NUMBER is required (comma-separated, normalized digits only)')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),

  WHATSAPP_SESSION_PATH: z.string().default('./.wwebjs_auth'),
  HELP_ASSETS_PATH: z.string().default('./assets/help'),

  SESSION_EXPIRY_MINUTES: z.coerce.number().int().positive().default(2),
  MAX_BATCH_ITEMS: z.coerce.number().int().positive().default(50),
  ENABLE_CLEAR_ALL: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
