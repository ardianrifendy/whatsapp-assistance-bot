import { Client, LocalAuth } from 'whatsapp-web.js';
import { env } from '../config/env.js';

export interface WhatsAppClientHandle {
  client: Client;
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
