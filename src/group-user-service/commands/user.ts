import { registerCommand } from '../../command-router/registry.js';
import { pool } from '../../persistence/db.js';
import { withTransaction } from '../../persistence/transactions.js';
import { UserFacingError } from '../../shared/errors.js';
import * as userService from '../userService.js';

function parseAddUserArgs(args: string[]): { number: string; name: string; roleToken: string } {
  if (args.length < 3) {
    throw new UserFacingError(
      'USER_TAMBAH_USAGE',
      'Format: !user tambah <nomor> <nama> user. Contoh: !user tambah 628123456789 Budi user',
    );
  }
  const number = args[0]!;
  const roleToken = args[args.length - 1]!;
  const name = args.slice(1, -1).join(' ');
  return { number, name, roleToken };
}

registerCommand({
  name: 'user tambah',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const { number, name, roleToken } = parseAddUserArgs(ctx.args);
    return withTransaction((client) =>
      userService.addUser(client, {
        whatsappNumber: number,
        displayName: name,
        roleToken,
        groupId: ctx.groupId,
        performedBy: ctx.userId,
        whatsappMessageId: ctx.messageId,
      }),
    );
  },
});

registerCommand({
  // Promotion/demotion of Admin is Owner-only per prd.md acceptance
  // criteria ("Role Admin hanya dapat diberikan atau dicabut oleh Owner").
  name: 'user role',
  allowedRoles: ['owner'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const number = ctx.args[0];
    const role = ctx.args[1];
    if (!number || !role) {
      throw new UserFacingError(
        'USER_ROLE_USAGE',
        'Format: !user role <nomor> <admin|user>. Contoh: !user role 628123456789 admin',
      );
    }
    return withTransaction((client) =>
      userService.setUserRole(client, {
        whatsappNumber: number,
        role,
        groupId: ctx.groupId,
        performedBy: ctx.userId,
        whatsappMessageId: ctx.messageId,
      }),
    );
  },
});

registerCommand({
  name: 'user aktif',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const number = ctx.args[0];
    if (!number) {
      throw new UserFacingError('USER_AKTIF_USAGE', 'Format: !user aktif <nomor>');
    }
    return withTransaction((client) =>
      userService.setUserActive(client, {
        whatsappNumber: number,
        isActive: true,
        groupId: ctx.groupId,
        performedBy: ctx.userId,
        whatsappMessageId: ctx.messageId,
      }),
    );
  },
});

registerCommand({
  name: 'user nonaktif',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    const number = ctx.args[0];
    if (!number) {
      throw new UserFacingError('USER_NONAKTIF_USAGE', 'Format: !user nonaktif <nomor>');
    }
    return withTransaction((client) =>
      userService.setUserActive(client, {
        whatsappNumber: number,
        isActive: false,
        groupId: ctx.groupId,
        performedBy: ctx.userId,
        whatsappMessageId: ctx.messageId,
      }),
    );
  },
});

registerCommand({
  name: 'user list',
  allowedRoles: ['owner', 'admin'],
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => userService.listUsers(pool, ctx.groupId),
});
