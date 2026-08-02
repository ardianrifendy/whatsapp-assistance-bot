// Re-exported for discoverability under conversation-session/ — the
// canonical type definitions live in src/types/session.ts so both the
// stub (below) and Worker D's real implementation import the same types
// as inventory-service (Worker C) does.
export type {
  SessionType,
  SessionStatus,
  ConversationSession,
  CreateConfirmationInput,
  SessionService,
} from '../types/session.js';
