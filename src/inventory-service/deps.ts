import { pool } from '../persistence/db.js';
import { createSessionService } from '../conversation-session/sessionService.real.js';
import type { SessionService } from '../types/session.js';

/**
 * Single composition point for the SessionService every inventory-service
 * command depends on. All business logic (previewService, stockMovementService,
 * the "!ya" handler) takes SessionService as a parameter and never imports a
 * concrete implementation itself.
 *
 * Wired to Worker D's real implementation (src/conversation-session/
 * sessionService.real.ts) — the same one help-service and
 * chat-moderation-service use — so every "confirmation" and "help_menu"
 * session lives behind one consistent implementation app-wide. The
 * manager-owned stub at sessionService.stub.ts remains available for tests
 * (it implements the identical interface) but is no longer used at runtime.
 */
export const sessionService: SessionService = createSessionService(pool);
