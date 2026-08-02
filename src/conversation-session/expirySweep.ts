import type { SessionService } from '../types/session.js';
import { logger } from '../shared/logger.js';

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * One-shot sweep, safe to call from a cron job, a health-check tick, or a
 * manual admin command. Resolves to the number of sessions flipped from
 * 'active' to 'expired'.
 */
export async function sweepExpiredSessions(sessionService: SessionService): Promise<number> {
  const count = await sessionService.sweepExpired();
  if (count > 0) {
    logger.debug({ count }, 'swept expired conversation sessions');
  }
  return count;
}

/**
 * Starts a periodic background sweep (default every 60s — sessions expire
 * after SESSION_EXPIRY_MINUTES, currently 2 minutes, so a 60s tick keeps
 * staleness bounded to about a minute). Not invoked at module load time by
 * design: importing this file has no side effects. The manager calls this
 * once during integration (e.g. from src/index.ts, after constructing the
 * real SessionService) and holds on to the returned stop function for
 * graceful shutdown.
 */
export function startExpirySweep(
  sessionService: SessionService,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    sweepExpiredSessions(sessionService).catch((err: unknown) => {
      logger.error({ err }, 'session expiry sweep failed');
    });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
