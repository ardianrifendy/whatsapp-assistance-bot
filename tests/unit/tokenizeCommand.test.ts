import { describe, it, expect } from 'vitest';
import { tokenizeCommand } from '../../src/message-normalizer/tokenizeCommand.js';

describe('tokenizeCommand: two-word base commands', () => {
  it('help stok', () => {
    expect(tokenizeCommand('!help stok')).toEqual({ command: 'help stok', args: [] });
  });

  it('help transaksi', () => {
    expect(tokenizeCommand('!help transaksi')).toEqual({ command: 'help transaksi', args: [] });
  });

  it('stok list', () => {
    expect(tokenizeCommand('!stok list')).toEqual({ command: 'stok list', args: [] });
  });

  it('stok saya', () => {
    expect(tokenizeCommand('!stok saya')).toEqual({ command: 'stok saya', args: [] });
  });

  it('stok user <name>', () => {
    expect(tokenizeCommand('!stok user Budi')).toEqual({ command: 'stok user', args: ['Budi'] });
  });

  it('stok sku <sku>', () => {
    expect(tokenizeCommand('!stok sku POCO-F7')).toEqual({ command: 'stok sku', args: ['POCO-F7'] });
  });

  it('stok cari <keyword>', () => {
    expect(tokenizeCommand('!stok cari redmi')).toEqual({ command: 'stok cari', args: ['redmi'] });
  });

  it('stok menipis', () => {
    expect(tokenizeCommand('!stok menipis')).toEqual({ command: 'stok menipis', args: [] });
  });

  it('grup daftar <nama gudang>', () => {
    expect(tokenizeCommand('!grup daftar Gudang Utama')).toEqual({
      command: 'grup daftar',
      args: ['Gudang', 'Utama'],
    });
  });

  it('grup status', () => {
    expect(tokenizeCommand('!grup status')).toEqual({ command: 'grup status', args: [] });
  });

  it('grup aktif', () => {
    expect(tokenizeCommand('!grup aktif')).toEqual({ command: 'grup aktif', args: [] });
  });

  it('grup nonaktif', () => {
    expect(tokenizeCommand('!grup nonaktif')).toEqual({ command: 'grup nonaktif', args: [] });
  });

  it('grup list', () => {
    expect(tokenizeCommand('!grup list')).toEqual({ command: 'grup list', args: [] });
  });

  it('user tambah <nomor> <nama> user', () => {
    expect(tokenizeCommand('!user tambah 628123456789 Budi user')).toEqual({
      command: 'user tambah',
      args: ['628123456789', 'Budi', 'user'],
    });
  });

  it('user role <nomor> <role>', () => {
    expect(tokenizeCommand('!user role 628123456789 admin')).toEqual({
      command: 'user role',
      args: ['628123456789', 'admin'],
    });
  });

  it('user aktif <nomor>', () => {
    expect(tokenizeCommand('!user aktif 628123456789')).toEqual({
      command: 'user aktif',
      args: ['628123456789'],
    });
  });

  it('user nonaktif <nomor>', () => {
    expect(tokenizeCommand('!user nonaktif 628123456789')).toEqual({
      command: 'user nonaktif',
      args: ['628123456789'],
    });
  });

  it('user list', () => {
    expect(tokenizeCommand('!user list')).toEqual({ command: 'user list', args: [] });
  });

  it('produk tambah', () => {
    expect(tokenizeCommand('!produk tambah')).toEqual({ command: 'produk tambah', args: [] });
  });

  it('produk ubah <sku>', () => {
    expect(tokenizeCommand('!produk ubah POCO-F7')).toEqual({
      command: 'produk ubah',
      args: ['POCO-F7'],
    });
  });

  it('produk nonaktif <sku>', () => {
    expect(tokenizeCommand('!produk nonaktif POCO-F7')).toEqual({
      command: 'produk nonaktif',
      args: ['POCO-F7'],
    });
  });

  it('produk cari <kata>', () => {
    expect(tokenizeCommand('!produk cari redmi')).toEqual({
      command: 'produk cari',
      args: ['redmi'],
    });
  });

  it('produk list', () => {
    expect(tokenizeCommand('!produk list')).toEqual({ command: 'produk list', args: [] });
  });

  it('clear bot', () => {
    expect(tokenizeCommand('!clear bot')).toEqual({ command: 'clear bot', args: [] });
  });

  it('clear saya', () => {
    expect(tokenizeCommand('!clear saya')).toEqual({ command: 'clear saya', args: [] });
  });

  it('clear recent <jumlah>', () => {
    expect(tokenizeCommand('!clear recent 20')).toEqual({ command: 'clear recent', args: ['20'] });
  });

  it('clear all', () => {
    expect(tokenizeCommand('!clear all')).toEqual({ command: 'clear all', args: [] });
  });

  it('is case-insensitive on both base and subcommand', () => {
    expect(tokenizeCommand('!STOK LIST')).toEqual({ command: 'stok list', args: [] });
  });
});

describe('tokenizeCommand: single-word base commands', () => {
  it('menu', () => {
    expect(tokenizeCommand('!menu')).toEqual({ command: 'menu', args: [] });
  });

  it('back', () => {
    expect(tokenizeCommand('!back')).toEqual({ command: 'back', args: [] });
  });

  it('cancel', () => {
    expect(tokenizeCommand('!cancel')).toEqual({ command: 'cancel', args: [] });
  });

  it('terima <transaction_id>', () => {
    expect(tokenizeCommand('!terima TX-001')).toEqual({ command: 'terima', args: ['TX-001'] });
  });

  it('riwayat [sku]', () => {
    expect(tokenizeCommand('!riwayat POCO-F7')).toEqual({ command: 'riwayat', args: ['POCO-F7'] });
  });

  it('koreksi <sku> <jumlah> <alasan>', () => {
    expect(tokenizeCommand('!koreksi POCO-F7 -2 rusak')).toEqual({
      command: 'koreksi',
      args: ['POCO-F7', '-2', 'rusak'],
    });
  });

  it('batal <transaction_id>', () => {
    expect(tokenizeCommand('!batal TX-001')).toEqual({ command: 'batal', args: ['TX-001'] });
  });

  it('ringkasan', () => {
    expect(tokenizeCommand('!ringkasan')).toEqual({ command: 'ringkasan', args: [] });
  });

  it('audit', () => {
    expect(tokenizeCommand('!audit')).toEqual({ command: 'audit', args: [] });
  });

  it('status', () => {
    expect(tokenizeCommand('!status')).toEqual({ command: 'status', args: [] });
  });

  it('ya (confirmation keyword)', () => {
    expect(tokenizeCommand('!ya')).toEqual({ command: 'ya', args: [] });
  });

  it('stok with no subcommand stays a bare single-word command', () => {
    expect(tokenizeCommand('!stok')).toEqual({ command: 'stok', args: [] });
  });

  it('unrecognized second word on a two-word base falls back to single-word', () => {
    // "stok" is a known base but "xyz" is not one of its known subcommands.
    expect(tokenizeCommand('!stok xyz')).toEqual({ command: 'stok', args: ['xyz'] });
  });
});

describe('tokenizeCommand: batch line extraction', () => {
  it('extracts multi-line batch bodies for !masuk', () => {
    const raw = ['!masuk PO-001', 'POCO-F7 | 3', 'REDMI-NOTE-13 | 5'].join('\n');
    expect(tokenizeCommand(raw)).toEqual({
      command: 'masuk',
      args: ['PO-001'],
      batchLines: ['POCO-F7 | 3', 'REDMI-NOTE-13 | 5'],
    });
  });

  it('extracts multi-line batch bodies for !dijalan', () => {
    const raw = ['!dijalan PO-002', 'POCO-F7 | 10'].join('\n');
    expect(tokenizeCommand(raw)).toEqual({
      command: 'dijalan',
      args: ['PO-002'],
      batchLines: ['POCO-F7 | 10'],
    });
  });

  it('extracts multi-line batch bodies for !keluar', () => {
    const raw = ['!keluar INV-100', 'POCO-F7 | 1', 'REDMI-NOTE-13 | 2'].join('\n');
    expect(tokenizeCommand(raw)).toEqual({
      command: 'keluar',
      args: ['INV-100'],
      batchLines: ['POCO-F7 | 1', 'REDMI-NOTE-13 | 2'],
    });
  });

  it('trims leading/trailing whitespace on each batch line but keeps internal spacing', () => {
    const raw = '!masuk PO-003\n   POCO-F7 | 3   \n  REDMI-NOTE-13 | 5';
    expect(tokenizeCommand(raw)).toEqual({
      command: 'masuk',
      args: ['PO-003'],
      batchLines: ['POCO-F7 | 3', 'REDMI-NOTE-13 | 5'],
    });
  });

  it('does not set batchLines for a single-line body', () => {
    const result = tokenizeCommand('!masuk PO-001');
    expect(result.batchLines).toBeUndefined();
  });

  it('ignores a trailing blank line and does not include it in batchLines', () => {
    const raw = '!masuk PO-001\nPOCO-F7 | 3\n';
    expect(tokenizeCommand(raw)).toEqual({
      command: 'masuk',
      args: ['PO-001'],
      batchLines: ['POCO-F7 | 3'],
    });
  });
});
