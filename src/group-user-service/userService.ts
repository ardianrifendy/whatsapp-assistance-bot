import type { Pool, PoolClient } from 'pg';
import { normalizeWhatsAppNumber } from '../message-normalizer/normalizeNumber.js';
import { logAudit } from '../audit-service/auditService.js';
import { UserFacingError } from '../shared/errors.js';
import type { CommandResult } from '../types/command.js';
import type { Role } from '../types/context.js';

type DbClient = Pool | PoolClient;
type MemberRole = Exclude<Role, 'owner'>;

const VALID_MEMBER_ROLES: readonly MemberRole[] = ['admin', 'user'];

/**
 * Masks a normalized WhatsApp number for display in list/report output,
 * per prd.md section 11 ("Nomor User dinormalisasi dan tidak ditampilkan
 * penuh di laporan umum"). Keeps the first 4 and last 3 digits, masking
 * the middle. Short/malformed numbers are returned unmasked rather than
 * risking a confusing all-asterisk string.
 */
export function maskWhatsappNumber(number: string): string {
  if (number.length <= 7) return number;
  const head = number.slice(0, 4);
  const tail = number.slice(-3);
  return `${head}${'*'.repeat(number.length - 7)}${tail}`;
}

function assertValidMemberRole(role: string): asserts role is MemberRole {
  if (!VALID_MEMBER_ROLES.includes(role as MemberRole)) {
    throw new UserFacingError('INVALID_ROLE', `Role tidak dikenal: "${role}". Gunakan "admin" atau "user".`);
  }
}

interface AddUserInput {
  whatsappNumber: string;
  displayName: string;
  roleToken: string;
  groupId: string;
  performedBy: string;
  whatsappMessageId: string;
}

/**
 * "!user tambah <nomor> <nama> user".
 *
 * Assumption on the trailing "user" token: per feature.md, promoting to
 * Admin is a separate Owner-only command ("!user role"), so this command
 * is validated to only ever create a plain 'user' membership — the
 * trailing token must literally be "user" (case-insensitive). Any other
 * value is rejected with a message pointing at "!user role", rather than
 * silently ignored, so a typo like "!user tambah 628... Budi admin" can
 * never accidentally grant Admin.
 */
export async function addUser(client: DbClient, input: AddUserInput): Promise<CommandResult> {
  const number = normalizeWhatsAppNumber(input.whatsappNumber);
  if (!number) {
    throw new UserFacingError(
      'USER_TAMBAH_USAGE',
      'Nomor tidak valid. Contoh: !user tambah 628123456789 Budi user',
    );
  }
  const name = input.displayName.trim();
  if (!name) {
    throw new UserFacingError(
      'USER_TAMBAH_USAGE',
      'Nama wajib diisi. Contoh: !user tambah 628123456789 Budi user',
    );
  }
  if (input.roleToken.toLowerCase() !== 'user') {
    throw new UserFacingError(
      'USER_TAMBAH_ROLE_INVALID',
      'Command ini hanya mendaftarkan role "user". Gunakan !user role <nomor> admin untuk menjadikan Admin.',
    );
  }

  const existingUserResult = await client.query<{ id: string; is_active: boolean }>(
    `SELECT id, is_active FROM bot_users WHERE whatsapp_number = $1`,
    [number],
  );
  const existingUser = existingUserResult.rows[0];
  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    await client.query(`UPDATE bot_users SET is_active = true, display_name = $1 WHERE id = $2`, [
      name,
      userId,
    ]);
  } else {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO bot_users (whatsapp_number, display_name, is_owner, is_active)
       VALUES ($1, $2, false, true)
       RETURNING id`,
      [number, name],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('failed to create user');
    userId = row.id;
  }

  const existingMemberResult = await client.query<{ id: string; is_active: boolean; role: string }>(
    `SELECT id, is_active, role FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [input.groupId, userId],
  );
  const existingMember = existingMemberResult.rows[0];

  if (existingMember && existingMember.is_active) {
    return { text: `${name} sudah terdaftar sebagai ${existingMember.role} di grup ini.` };
  }

  if (existingMember) {
    await client.query(`UPDATE group_members SET is_active = true, role = 'user' WHERE id = $1`, [
      existingMember.id,
    ]);
  } else {
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, is_active) VALUES ($1, $2, 'user', true)`,
      [input.groupId, userId],
    );
  }

  await logAudit(client, {
    action: 'user_added',
    targetType: existingMember ? 'group_member' : 'bot_user',
    targetId: userId,
    performedBy: input.performedBy,
    groupId: input.groupId,
    beforeData: existingMember ? { isActive: existingMember.is_active, role: existingMember.role } : null,
    afterData: { isActive: true, role: 'user', whatsappNumber: maskWhatsappNumber(number), displayName: name },
    whatsappMessageId: input.whatsappMessageId,
  });

  return { text: `${name} berhasil didaftarkan sebagai User di grup ini.` };
}

interface SetUserRoleInput {
  whatsappNumber: string;
  role: string;
  groupId: string;
  performedBy: string;
  whatsappMessageId: string;
}

/** "!user role <nomor> <admin|user>" — Owner-only, enforced at the command definition. */
export async function setUserRole(client: DbClient, input: SetUserRoleInput): Promise<CommandResult> {
  const role = input.role.toLowerCase();
  assertValidMemberRole(role);

  const number = normalizeWhatsAppNumber(input.whatsappNumber);
  const userResult = await client.query<{ id: string; is_active: boolean; display_name: string | null }>(
    `SELECT id, is_active, display_name FROM bot_users WHERE whatsapp_number = $1`,
    [number],
  );
  const user = userResult.rows[0];
  if (!user || !user.is_active) {
    throw new UserFacingError('USER_NOT_FOUND', 'Nomor tersebut belum terdaftar sebagai User.');
  }

  const memberResult = await client.query<{ id: string; role: string; is_active: boolean }>(
    `SELECT id, role, is_active FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [input.groupId, user.id],
  );
  const member = memberResult.rows[0];
  if (!member) {
    throw new UserFacingError('USER_NOT_MEMBER', 'Nomor tersebut belum menjadi anggota grup ini.');
  }

  await client.query(`UPDATE group_members SET role = $1, is_active = true WHERE id = $2`, [role, member.id]);

  await logAudit(client, {
    action: 'user_role_changed',
    targetType: 'group_member',
    targetId: member.id,
    performedBy: input.performedBy,
    groupId: input.groupId,
    beforeData: { role: member.role, isActive: member.is_active },
    afterData: { role, isActive: true },
    whatsappMessageId: input.whatsappMessageId,
  });

  const name = user.display_name ?? maskWhatsappNumber(number);
  return { text: `Role ${name} diubah menjadi ${role}.` };
}

interface SetUserActiveInput {
  whatsappNumber: string;
  isActive: boolean;
  groupId: string;
  performedBy: string;
  whatsappMessageId: string;
}

/** "!user aktif" / "!user nonaktif" <nomor> — Admin or Owner. */
export async function setUserActive(client: DbClient, input: SetUserActiveInput): Promise<CommandResult> {
  const number = normalizeWhatsAppNumber(input.whatsappNumber);
  const userResult = await client.query<{ id: string; display_name: string | null }>(
    `SELECT id, display_name FROM bot_users WHERE whatsapp_number = $1`,
    [number],
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new UserFacingError('USER_NOT_FOUND', 'Nomor tersebut belum terdaftar.');
  }

  const memberResult = await client.query<{ id: string; is_active: boolean; role: string }>(
    `SELECT id, is_active, role FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [input.groupId, user.id],
  );
  const member = memberResult.rows[0];
  if (!member) {
    throw new UserFacingError('USER_NOT_MEMBER', 'Nomor tersebut belum menjadi anggota grup ini.');
  }

  await client.query(`UPDATE group_members SET is_active = $1 WHERE id = $2`, [input.isActive, member.id]);

  await logAudit(client, {
    action: input.isActive ? 'user_activated' : 'user_deactivated',
    targetType: 'group_member',
    targetId: member.id,
    performedBy: input.performedBy,
    groupId: input.groupId,
    beforeData: { isActive: member.is_active },
    afterData: { isActive: input.isActive },
    whatsappMessageId: input.whatsappMessageId,
  });

  const name = user.display_name ?? maskWhatsappNumber(number);
  return { text: input.isActive ? `${name} telah diaktifkan kembali.` : `${name} telah dinonaktifkan.` };
}

interface UserListRow {
  whatsapp_number: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
}

/** "!user list" — Admin or Owner, scoped to the current group. */
export async function listUsers(client: DbClient, groupId: string): Promise<CommandResult> {
  const result = await client.query<UserListRow>(
    `SELECT u.whatsapp_number, u.display_name, m.role, m.is_active
     FROM group_members m
     JOIN bot_users u ON u.id = m.user_id
     WHERE m.group_id = $1
     ORDER BY m.created_at ASC`,
    [groupId],
  );

  if (result.rows.length === 0) {
    return { text: 'Belum ada User terdaftar di grup ini.' };
  }

  const lines = result.rows.map((r, i) => {
    const name = r.display_name ?? '(tanpa nama)';
    const status = r.is_active ? 'Aktif' : 'Nonaktif';
    return `${i + 1}. ${name} (${maskWhatsappNumber(r.whatsapp_number)}) — ${r.role} — ${status}`;
  });

  return { text: ['Daftar User grup ini:', ...lines].join('\n') };
}
