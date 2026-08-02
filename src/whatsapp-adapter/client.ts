// whatsapp-web.js is CommonJS; Node's ESM loader cannot statically detect
// its named exports (they're assigned via `require()` inside an object
// literal, which cjs-module-lexer can't analyze), so we must import the
// default export and destructure at runtime. Type-only usages elsewhere
// in this file still import the type named export directly since those
// are erased at compile time and never hit this restriction.
import fs from 'node:fs';
import path from 'node:path';
import pkg from 'whatsapp-web.js';
import type { Client as WAClient } from 'whatsapp-web.js';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';

const { Client, LocalAuth } = pkg;

export interface WhatsAppClientHandle {
  client: WAClient;
  /** Starts the puppeteer session and begins the auth/QR flow. */
  initialize: () => Promise<void>;
  /** Gracefully closes the browser session. */
  destroy: () => Promise<void>;
}

// Chromium refuses to launch against a profile directory that still has a
// SingletonLock from a previous run (chrome/browser/process_singleton_posix.cc).
// In a container that gets SIGKILLed (Docker stop timeout, OOM, --force-recreate
// racing a live container) Chromium never gets a chance to remove its own lock,
// so it's left behind in the persistent WHATSAPP_SESSION_PATH volume and blocks
// every future launch. Since this deployment only ever runs one bot instance
// against this volume at a time, it's always safe to clear stale lock files
// before launching — there is no legitimate concurrent process to protect
// against here, unlike Chromium's default multi-instance-on-one-machine case.
const SINGLETON_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

function clearStaleChromiumLocks(sessionPath: string): void {
  // LocalAuth's default (no clientId) userDataDir is `<dataPath>/session`.
  const profileDir = path.join(sessionPath, 'session');
  for (const file of SINGLETON_LOCK_FILES) {
    try {
      fs.rmSync(path.join(profileDir, file), { force: true });
    } catch (err) {
      logger.warn({ err, file }, 'failed to clear stale Chromium lock file');
    }
  }
}

/**
 * Creates a whatsapp-web.js Client wired to LocalAuth session storage under
 * WHATSAPP_SESSION_PATH (persisted via a mounted volume in production so
 * restarts don't require re-scanning the QR code).
 */
export function createWhatsAppClient(): WhatsAppClientHandle {
  clearStaleChromiumLocks(env.WHATSAPP_SESSION_PATH);

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
