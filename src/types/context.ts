export type Role = 'owner' | 'admin' | 'user';

/**
 * Fully resolved per-message context handed to every command handler.
 * By the time a handler runs, the access-control gate has already
 * rejected unregistered groups/users and inactive accounts, so every
 * field below is guaranteed non-null.
 */
export interface HandlerContext {
  messageId: string;
  chatId: string;
  groupId: string;
  warehouseId: string;
  senderJid: string;
  userId: string;
  role: Role;
  isOwner: boolean;
  quotedMessageId: string | null;
  sessionId: string | null;
  args: string[];
  rawBody: string;
  /** Populated by the router for multi-line batch commands (e.g. !masuk). */
  batchLines?: string[];
}
