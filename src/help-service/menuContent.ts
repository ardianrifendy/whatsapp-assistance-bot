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
  /** One-line teaser shown next to the label in the main menu. */
  hint: string;
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
    '👋 *Selamat datang di Bot Stok!*',
    '',
    'Saya bantu cek stok, catat transaksi, sampai lihat riwayat — semua lewat chat ini, tanpa aplikasi tambahan.',
    '',
    'Pilih topik di bawah untuk contoh lengkap, atau langsung coba perintahnya kapan saja.',
  ].join('\n'),
  stok: [
    '📦 *Perintah Stok*',
    '',
    '!stok',
    '   → ringkasan cepat stok gudang',
    '',
    '!stok list',
    '   → daftar lengkap semua stok',
    '',
    '!stok saya',
    '   → stok yang jadi tanggung jawab Anda',
    '',
    '!stok sku SKU001',
    '   → cek satu produk lewat SKU-nya',
    '',
    '!stok cari kabel',
    '   → cari produk dari nama/alias',
    '',
    '!stok menipis',
    '   → produk yang sudah di bawah minimum stok',
    '',
    '!stok user Budi',
    '   → stok milik User lain (khusus Admin/Owner)',
  ].join('\n'),
  transaksi: [
    '🔄 *Perintah Transaksi*',
    '',
    'Barang masuk (bisa banyak item sekaligus):',
    '!masuk PO-001',
    'SKU001 | 10',
    'SKU002 | 5',
    '',
    'Barang keluar:',
    '!keluar INV-045',
    'SKU001 | 2',
    '',
    'Koreksi stok (Admin/Owner, jumlah boleh negatif, wajib alasan):',
    '!koreksi SKU001 -3 barang rusak',
    '',
    'Membalikkan transaksi (Admin/Owner):',
    '!batal MV-000012',
    '',
    '💡 Semua di atas menampilkan *pratinjau* dulu, tidak langsung dieksekusi.',
    'Balas (quote) pesan pratinjau itu dengan !ya untuk konfirmasi, atau !cancel untuk batal.',
  ].join('\n'),
  in_transit: [
    '🚚 *Barang Di Jalan*',
    '',
    'Catat barang yang sedang dikirim:',
    '!dijalan PO-002',
    'SKU001 | 20',
    '',
    'Terima barang (boleh sebagian, tidak harus sekaligus):',
    '!terima MV-000010 15',
    '   → menerima 15 unit dari transaksi MV-000010',
  ].join('\n'),
  history: [
    '🕘 *Riwayat Transaksi*',
    '',
    '!riwayat',
    '   → semua riwayat transaksi',
    '',
    '!riwayat SKU001',
    '   → riwayat khusus satu SKU',
  ].join('\n'),
  admin: [
    '🛠️ *Menu Admin & Owner*',
    '',
    '*Grup & Gudang*',
    '!grup daftar Gudang Utama',
    '!grup status  |  !grup aktif  |  !grup nonaktif',
    '',
    '*User*',
    '!user tambah 628123456789 Budi user',
    '!user role 628123456789 admin   (Owner saja)',
    '!user aktif 628123456789  |  !user nonaktif 628123456789',
    '!user list',
    '',
    '*Produk*',
    '!produk tambah SKU001 | Kabel USB-C | pcs | 5 | usbc,kabel',
    '!produk ubah SKU001 | ... (isi kosong = tetap)',
    '!produk nonaktif SKU001',
    '',
    '!audit',
    '   → lihat log aktivitas',
  ].join('\n'),
  confirmation: [
    '✅ *Soal Konfirmasi*',
    '',
    'Perintah yang mengubah stok (!masuk, !keluar, !dijalan, !terima, !koreksi, !batal)',
    'dan beberapa !clear tidak langsung dieksekusi — bot akan tunjukkan *pratinjau* dulu.',
    '',
    'Cara konfirmasi:',
    '1. Balas (quote) pesan pratinjau tersebut',
    '2. Ketik !ya untuk lanjut, atau !cancel untuk batal',
    '',
    '⏱️ Pratinjau kedaluwarsa otomatis kalau tidak direspons.',
  ].join('\n'),
};

function mainMenuOptions(role: Role): MenuOption[] {
  const options: MenuOption[] = [
    { digit: '1', label: 'Stok', hint: 'cek & cari stok barang', target: 'stok' },
    { digit: '2', label: 'Transaksi', hint: 'masuk, keluar, koreksi', target: 'transaksi' },
    { digit: '3', label: 'Barang Di Jalan', hint: 'kirim & terima barang', target: 'in_transit' },
    { digit: '4', label: 'Riwayat', hint: 'histori semua transaksi', target: 'history' },
    { digit: '5', label: 'Konfirmasi', hint: 'cara kerja !ya / !cancel', target: 'confirmation' },
  ];
  if (isTopicAllowed('admin', role)) {
    options.push({ digit: '6', label: 'Admin', hint: 'kelola grup, user, produk', target: 'admin' });
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
    lines.push('👇 *Balas (quote) pesan ini* dengan salah satu nomor berikut:');
    for (const opt of content.options) {
      lines.push(`!${opt.digit}  *${opt.label}* — ${opt.hint}`);
    }
  }
  lines.push('');
  lines.push('↩️ !back - kembali ke menu sebelumnya   ✖️ !cancel - tutup sesi bantuan');
  return lines.join('\n');
}
