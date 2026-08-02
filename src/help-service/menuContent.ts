import { join } from 'node:path';
import type { Role } from '../types/context.js';
import { env } from '../config/env.js';
import { HELP_ASSET_FILES } from '../shared/constants.js';

export type HelpAssetFile = (typeof HELP_ASSET_FILES)[number];

export type MenuTopic =
  | 'main'
  | 'stok'
  | 'transaksi'
  | 'in_transit'
  | 'history'
  | 'admin'
  | 'confirmation';

export interface MenuOption {
  /** The digit the user quote-replies with (registered as commands "1".."9"). */
  digit: string;
  label: string;
  target: MenuTopic;
}

export interface MenuContent {
  topic: MenuTopic;
  assetFile: HelpAssetFile;
  body: string;
  options: MenuOption[];
}

/** Payload shape stored in conversation_sessions.payload for help_menu sessions. */
export interface HelpMenuPayload {
  kind: 'help_menu';
  topic: MenuTopic;
  /** Stack of previous topics; !back pops the top entry and re-renders it. */
  history: MenuTopic[];
}

export function isHelpMenuPayload(payload: unknown): payload is HelpMenuPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.kind === 'help_menu' &&
    typeof p.topic === 'string' &&
    Array.isArray(p.history) &&
    p.history.every((t) => typeof t === 'string')
  );
}

const ASSET_BY_TOPIC: Record<MenuTopic, HelpAssetFile> = {
  main: 'help-main.png',
  stok: 'help-stock.png',
  transaksi: 'help-transaction.png',
  in_transit: 'help-in-transit.png',
  history: 'help-history.png',
  admin: 'help-admin.png',
  confirmation: 'help-confirmation.png',
};

/**
 * Topics whose content/asset must never reach a plain 'user' role. Enforced
 * here in getMenuContent() (the single lookup path every command handler
 * uses), not just by gating which digit leads to it from the main menu —
 * !help and the digit commands are shared across all roles, so the
 * role check has to live where the content is actually resolved.
 */
const ROLE_RESTRICTED_TOPICS: Partial<Record<MenuTopic, readonly Role[]>> = {
  admin: ['owner', 'admin'],
};

function isTopicAllowed(topic: MenuTopic, role: Role): boolean {
  const allowed = ROLE_RESTRICTED_TOPICS[topic];
  return !allowed || allowed.includes(role);
}

const BODY_BY_TOPIC: Record<MenuTopic, string> = {
  main: [
    'Selamat datang di Bantuan Bot Stok.',
    'Pilih topik di bawah ini untuk melihat panduan lebih lanjut.',
  ].join('\n'),
  stok: [
    'Perintah stok:',
    '!stok - ringkasan stok',
    '!stok list - daftar stok gudang',
    '!stok saya - stok milik Anda',
    '!stok user <nama|nomor> - stok milik User lain (Admin/Owner)',
    '!stok sku <sku> - stok berdasarkan SKU',
    '!stok cari <kata> - cari produk',
    '!stok menipis - produk di bawah minimum stok',
  ].join('\n'),
  transaksi: [
    'Perintah transaksi:',
    '!masuk <referensi> - catat barang masuk Ready',
    '!keluar <referensi> - catat barang keluar dari Ready',
    '!koreksi <sku> <jumlah> <alasan> - penyesuaian stok (Admin)',
    '!batal <transaction_id> - membalikkan transaksi',
    '',
    'Semua transaksi menampilkan pratinjau lebih dulu. Balas (quote) pratinjau',
    'dengan !ya untuk konfirmasi atau !cancel untuk membatalkan.',
  ].join('\n'),
  in_transit: [
    'Perintah barang di jalan:',
    '!dijalan <referensi> - catat barang dalam perjalanan',
    '!terima <transaction_id> - pindahkan barang Di Jalan ke Ready',
  ].join('\n'),
  history: ['Perintah riwayat:', '!riwayat [sku] - riwayat transaksi, opsional filter SKU'].join('\n'),
  admin: [
    'Perintah manajemen (Admin/Owner):',
    '!grup daftar <nama gudang> / !grup status / !grup aktif / !grup nonaktif',
    '!user tambah / !user role / !user aktif / !user nonaktif / !user list',
    '!produk tambah / !produk ubah <sku> / !produk nonaktif <sku>',
    '!audit - lihat log audit',
  ].join('\n'),
  confirmation: [
    'Tentang konfirmasi:',
    'Perintah yang mengubah stok (!masuk, !keluar, !dijalan, !terima, !koreksi, !batal)',
    'dan beberapa perintah !clear akan menampilkan pratinjau terlebih dahulu.',
    'Balas (quote) pesan pratinjau tersebut dengan !ya untuk melanjutkan,',
    'atau !cancel untuk membatalkan. Sesi pratinjau kedaluwarsa otomatis.',
  ].join('\n'),
};

function mainMenuOptions(role: Role): MenuOption[] {
  const options: MenuOption[] = [
    { digit: '1', label: 'Stok', target: 'stok' },
    { digit: '2', label: 'Transaksi', target: 'transaksi' },
    { digit: '3', label: 'Barang Di Jalan', target: 'in_transit' },
    { digit: '4', label: 'Riwayat', target: 'history' },
    { digit: '5', label: 'Konfirmasi', target: 'confirmation' },
  ];
  if (isTopicAllowed('admin', role)) {
    options.push({ digit: '6', label: 'Admin', target: 'admin' });
  }
  return options;
}

function optionsForTopic(topic: MenuTopic, role: Role): MenuOption[] {
  return topic === 'main' ? mainMenuOptions(role) : [];
}

/**
 * Single lookup path for menu content. If `topic` is restricted for `role`
 * (currently only 'admin'), silently falls back to the main menu instead
 * of ever returning the restricted body/asset — this is the enforcement
 * point, independent of how the caller arrived at `topic` (typed command,
 * digit selection, or !back).
 */
export function getMenuContent(topic: MenuTopic, role: Role): MenuContent {
  const effectiveTopic = isTopicAllowed(topic, role) ? topic : 'main';
  return {
    topic: effectiveTopic,
    assetFile: ASSET_BY_TOPIC[effectiveTopic],
    body: BODY_BY_TOPIC[effectiveTopic],
    options: optionsForTopic(effectiveTopic, role),
  };
}

export function resolveAssetPath(assetFile: HelpAssetFile): string {
  return join(env.HELP_ASSETS_PATH, assetFile);
}

export function renderMenuText(content: MenuContent): string {
  const lines = [content.body];
  if (content.options.length > 0) {
    lines.push('');
    lines.push('Balas (quote) pesan ini dengan salah satu perintah berikut:');
    for (const opt of content.options) {
      lines.push(`!${opt.digit} - ${opt.label}`);
    }
  }
  lines.push('');
  lines.push('!back - menu sebelumnya | !cancel - akhiri sesi bantuan');
  return lines.join('\n');
}
