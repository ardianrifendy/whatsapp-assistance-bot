// Side-effecting import barrel: pulling this module in once (from the
// manager's integration entrypoint) registers every !grup and !user
// command with the shared command-router registry.
import './grup.js';
import './user.js';
