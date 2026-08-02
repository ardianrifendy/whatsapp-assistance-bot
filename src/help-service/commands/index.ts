/**
 * Side-effecting import barrel: pulls in every help-service command module
 * so that importing this one file registers "help", "help stok",
 * "help transaksi", "menu", "back", "cancel", "0", and "1".."9" into the
 * shared command registry. The manager's integration entrypoint imports
 * this (alongside the other workers' equivalents) purely for its side
 * effects.
 */
import './help.js';
import './menu.js';
import './back.js';
import './cancel.js';
import './digitSelect.js';
import './zero.js';
