import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';
import { pool } from './persistence/db.js';
import { bootstrapOwner } from './persistence/ownerBootstrap.js';

// Side-effecting: registers every worker's commands into the shared registry.
import './command-router/bootstrap.js';

import { dispatch } from './command-router/dispatch.js';
import type { DispatchDeps } from './command-router/dispatch.js';
import { createWhatsAppClient } from './whatsapp-adapter/client.js';
import { registerQrHandler } from './whatsapp-adapter/qr.js';
import { registerLifecycleHandlers } from './whatsapp-adapter/reconnect.js';
import { registerMessageHandler } from './whatsapp-adapter/events.js';
import { createSendResponse, createSendError } from './whatsapp-adapter/send.js';
import { createAccessResolver } from './access-control/resolveAccess.js';
import { createSessionService } from './conversation-session/sessionService.real.js';
import { createSessionResolver } from './conversation-session/resolveSessionId.js';
import { startExpirySweep } from './conversation-session/expirySweep.js';

let dbReady = false;
let whatsappReady = false;

async function main(): Promise<void> {
  await pool.query('SELECT 1');
  dbReady = true;
  logger.info('database connection ok');

  await bootstrapOwner(pool, env.OWNER_WHATSAPP_NUMBER);
  logger.info({ owner: env.OWNER_WHATSAPP_NUMBER }, 'owner bootstrap complete');

  const sessionService = createSessionService(pool);
  startExpirySweep(sessionService);

  const { client, initialize } = createWhatsAppClient();
  registerQrHandler(client);
  registerLifecycleHandlers(client);
  client.on('ready', () => {
    whatsappReady = true;
    logger.info('whatsapp client ready');
  });
  client.on('disconnected', () => {
    whatsappReady = false;
  });

  const deps: DispatchDeps = {
    resolveAccess: createAccessResolver(pool),
    resolveSessionId: createSessionResolver(sessionService),
    sendResponse: createSendResponse(client),
    sendError: createSendError(client),
    attachAnchor: (sessionId, anchorMessageId) => sessionService.attachAnchor(sessionId, anchorMessageId),
  };

  registerMessageHandler(client, (msg) => dispatch(pool, msg, deps));

  await initialize();

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const ok = dbReady && whatsappReady;
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ db: dbReady, whatsapp: whatsappReady }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(env.HEALTHCHECK_PORT, () => {
    logger.info({ port: env.HEALTHCHECK_PORT }, 'health server listening');
  });
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
