// whatsapp-web.js is CommonJS; Node's ESM loader cannot statically detect
// its named exports (they're assigned via `require()` inside an object
// literal, which cjs-module-lexer can't analyze), so we must import the
// default export and destructure at runtime. Type-only usages elsewhere
// in this file still import the type named export directly since those
// are erased at compile time and never hit this restriction.
import pkg from 'whatsapp-web.js';
import type { Client as WAClient } from 'whatsapp-web.js';
import { env } from '../config/env.js';

const { Client, LocalAuth } = pkg;

export interface WhatsAppClientHandle {
  client: WAClient;
  /** Starts the puppeteer session and begins the auth/QR flow. */
  initialize: () => Promise<void>;
  /** Gracefully closes the browser session. */
  destroy: () => Promise<void>;
}

/**
 * Creates a whatsapp-web.js Client wired to LocalAuth session storage under
 * WHATSAPP_SESSION_PATH (persisted via a mounted volume in production so
 * restarts don't require re-scanning the QR code).
 */
export function createWhatsAppClient(): WhatsAppClientHandle {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: env.WHATSAPP_SESSION_PATH }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  return {
    client,
    initialize: () => client.initialize(),
    destroy: () => client.destroy(),
  };
}
