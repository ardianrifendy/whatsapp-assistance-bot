import type { HandlerContext, Role } from './context.js';

export type AllowedRoles = Role[] | 'any';

export interface CommandResult {
  /** Text sent back to the group as a reply to the triggering message. */
  text: string;
  /** Optional path (under HELP_ASSETS_PATH or absolute) to an image to send alongside text. */
  imagePath?: string;
  /**
   * Set when this response is a preview awaiting confirmation: the ID of
   * the conversation_sessions row already created by the handler via
   * SessionService.createConfirmation (without an anchor yet). The
   * router attaches the just-sent WhatsApp message ID as that session's
   * anchor right after delivery, since the ID doesn't exist beforehand.
   */
  pendingSessionId?: string;
  /**
   * Set by chat-moderation-service's !clear handlers to request an actual
   * WhatsApp message deletion. Only the whatsapp-adapter layer (which holds
   * the live Chat/Message objects) can act on this — handlers themselves
   * never touch the WhatsApp client directly. Executed AFTER the text reply
   * in `result.text` has been sent.
   */
  clearAction?: {
    scope: 'bot' | 'saya' | 'recent' | 'all';
    /** Only meaningful for scope 'recent': how many recent messages to remove. */
    limit?: number;
    /** Only meaningful for scope 'saya': whose messages to remove (normalized WhatsApp number or JID). */
    targetSenderJid?: string;
  };
}

export interface CommandDefinition {
  /** Canonical command name without the "!" prefix, e.g. "stok list", "grup daftar". */
  name: string;
  allowedRoles: AllowedRoles;
  /**
   * False only for the owner-bypass case ("grup daftar"), which must be
   * reachable even when the group itself is not yet registered.
   */
  requiresRegisteredGroup: boolean;
  /** True for masuk/dijalan/terima/keluar/koreksi/batal — preview + confirm required. */
  requiresPreviewConfirm: boolean;
  handler: (ctx: HandlerContext) => Promise<CommandResult>;
}
