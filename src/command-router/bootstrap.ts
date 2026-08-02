/**
 * Manager-owned composition root for command registration. Importing this
 * module once (from src/index.ts) pulls in every worker's side-effecting
 * command-registration barrel, so the shared registry (registry.ts) ends
 * up populated with every "!command" the bot supports. No individual
 * worker file imports another worker's commands directly — this is the
 * one place they all meet.
 */
import '../group-user-service/commands/index.js';
import '../inventory-service/commands/index.js';
import '../help-service/commands/index.js';
import '../chat-moderation-service/commands/clear.js';
