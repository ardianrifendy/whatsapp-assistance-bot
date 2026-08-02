/**
 * Pure parser for raw WhatsApp message bodies into a canonical command
 * shape. No I/O. See feature.md / implementation.md for the command list.
 */
export interface TokenizedCommand {
  /** Canonical command name, e.g. "stok" or "stok list" (space-joined, lowercased). */
  command: string;
  args: string[];
  /** Present only when the raw body had 2+ non-empty lines (batch commands). */
  batchLines?: string[];
}

/**
 * Base commands that have known two-word subcommands. If tokens[0] matches
 * a key here (case-insensitively) AND tokens[1] matches one of the listed
 * subcommands, the command collapses to "base sub"; otherwise it falls back
 * to the single-word form ("base" alone, e.g. bare "!stok").
 */
const TWO_WORD_SUBCOMMANDS: Record<string, readonly string[]> = {
  help: ['stok', 'transaksi'],
  stok: ['list', 'saya', 'user', 'sku', 'cari', 'menipis'],
  grup: ['daftar', 'status', 'aktif', 'nonaktif', 'list'],
  user: ['tambah', 'role', 'aktif', 'nonaktif', 'list'],
  produk: ['tambah', 'ubah', 'nonaktif', 'cari', 'list'],
  clear: ['bot', 'saya', 'recent', 'all'],
};

export function tokenizeCommand(rawBody: string): TokenizedCommand {
  const body = rawBody.startsWith('!') ? rawBody.slice(1) : rawBody;
  const lines = body.split(/\r\n|\r|\n/);

  const firstLine = (lines[0] ?? '').trim();
  const tokens = firstLine.split(/\s+/).filter((t) => t.length > 0);

  const base = (tokens[0] ?? '').toLowerCase();
  const second = (tokens[1] ?? '').toLowerCase();

  const knownSubs = TWO_WORD_SUBCOMMANDS[base];

  let command: string;
  let args: string[];
  if (knownSubs && knownSubs.includes(second)) {
    command = `${base} ${second}`;
    args = tokens.slice(2);
  } else {
    command = base;
    args = tokens.slice(1);
  }

  const result: TokenizedCommand = { command, args };

  if (lines.length > 1) {
    const batchLines = lines
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (batchLines.length > 0) {
      result.batchLines = batchLines;
    }
  }

  return result;
}
