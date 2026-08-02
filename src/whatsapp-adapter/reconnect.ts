import type { Client, WAState } from 'whatsapp-web.js';
import { logger } from '../shared/logger.js';

/** Exponential backoff steps in ms, capped at 60s. */
const BACKOFF_STEPS_MS = [5000, 10000, 20000, 60000] as const;

/**
 * Wires connection-lifecycle logging plus an exponential-backoff reconnect
 * loop on `disconnected`. whatsapp-web.js does not auto-reconnect on its
 * own once the underlying puppeteer session drops, so we re-run
 * client.initialize() ourselves.
 */
export function registerLifecycleHandlers(client: Client): void {
  const state = { attempt: 0, reconnecting: false };

  client.on('ready', () => {
    state.attempt = 0;
    state.reconnecting = false;
    logger.info('WhatsApp client ready');
  });

  client.on('auth_failure', (message: string) => {
    logger.error({ message }, 'WhatsApp authentication failure');
  });

  client.on('disconnected', (reason: WAState | 'LOGOUT') => {
    logger.warn({ reason }, 'WhatsApp client disconnected');
    void attemptReconnect(client, state);
  });
}

interface ReconnectState {
  attempt: number;
  reconnecting: boolean;
}

async function attemptReconnect(client: Client, state: ReconnectState): Promise<void> {
  if (state.reconnecting) return;
  state.reconnecting = true;

  while (state.reconnecting) {
    const delayMs = BACKOFF_STEPS_MS[Math.min(state.attempt, BACKOFF_STEPS_MS.length - 1)] as number;
    logger.info({ delayMs, attempt: state.attempt + 1 }, 'reconnecting to WhatsApp after backoff');
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    try {
      await client.initialize();
      state.reconnecting = false;
      return;
    } catch (err) {
      state.attempt += 1;
      logger.error({ err, attempt: state.attempt }, 'reconnect attempt failed, retrying');
    }
  }
}
