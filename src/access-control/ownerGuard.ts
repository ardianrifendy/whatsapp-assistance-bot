/**
 * The one command allowed to run against an unregistered (or inactive)
 * group, provided the sender resolves to an active Owner. See
 * resolveAccess.ts for the full resolution order this constant plugs into.
 */
export const OWNER_GROUP_BYPASS_COMMAND = 'grup daftar';
