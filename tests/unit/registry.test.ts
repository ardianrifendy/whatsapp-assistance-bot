import { describe, it, expect, afterEach } from 'vitest';
import { registerCommand, getCommand, listCommands, __resetRegistryForTests } from '../../src/command-router/registry.js';

afterEach(() => {
  __resetRegistryForTests();
});

describe('command registry', () => {
  it('registers and retrieves a command by name', () => {
    registerCommand({
      name: 'stok list',
      allowedRoles: 'any',
      requiresRegisteredGroup: true,
      requiresPreviewConfirm: false,
      handler: async () => ({ text: 'ok' }),
    });

    expect(getCommand('stok list')?.name).toBe('stok list');
    expect(listCommands()).toHaveLength(1);
  });

  it('throws when the same command name is registered twice', () => {
    registerCommand({
      name: 'grup daftar',
      allowedRoles: 'any',
      requiresRegisteredGroup: false,
      requiresPreviewConfirm: false,
      handler: async () => ({ text: 'ok' }),
    });

    expect(() =>
      registerCommand({
        name: 'grup daftar',
        allowedRoles: 'any',
        requiresRegisteredGroup: false,
        requiresPreviewConfirm: false,
        handler: async () => ({ text: 'dup' }),
      }),
    ).toThrow(/already registered/);
  });
});
