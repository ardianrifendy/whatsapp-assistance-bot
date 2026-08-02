import { describe, it, expect } from 'vitest';
import { listCommands } from '../../src/command-router/registry.js';

// Importing bootstrap.ts pulls in every worker's commands/index.ts as a
// side effect. registerCommand() throws on a duplicate name, so if this
// import succeeds at all, no two workers collided on the same command
// name — this is the key cross-worker integration guarantee.
import '../../src/command-router/bootstrap.js';

describe('command bootstrap', () => {
  it('registers every command from all four workers with no name collisions', () => {
    const names = listCommands().map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);

    const expectedSample = [
      'grup daftar',
      'grup status',
      'user tambah',
      'user role',
      'stok list',
      'stok saya',
      'masuk',
      'dijalan',
      'terima',
      'keluar',
      'koreksi',
      'batal',
      'riwayat',
      'ya',
      'help',
      'menu',
      'back',
      'cancel',
      '0',
      '1',
      'clear bot',
      'clear saya',
      'clear recent',
    ];
    for (const name of expectedSample) {
      expect(names).toContain(name);
    }
  });

  it('does not register "clear all" when ENABLE_CLEAR_ALL is false (the test env default)', () => {
    const names = listCommands().map((c) => c.name);
    expect(names).not.toContain('clear all');
  });
});
