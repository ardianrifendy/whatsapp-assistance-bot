import { describe, it, expect } from 'vitest';
import {
  getMenuContent,
  isHelpMenuPayload,
  renderMenuText,
  resolveAssetPath,
} from '../../src/help-service/menuContent.js';

describe('getMenuContent role gating', () => {
  it('never returns the admin topic content/asset for a plain user role', () => {
    const content = getMenuContent('admin', 'user');

    expect(content.topic).not.toBe('admin');
    expect(content.assetFile).not.toBe('help-admin.png');
    expect(content.body).not.toContain('!grup daftar');
  });

  it('returns the admin topic content/asset for admin and owner roles', () => {
    const forAdmin = getMenuContent('admin', 'admin');
    const forOwner = getMenuContent('admin', 'owner');

    expect(forAdmin.topic).toBe('admin');
    expect(forAdmin.assetFile).toBe('help-admin.png');
    expect(forOwner.topic).toBe('admin');
    expect(forOwner.assetFile).toBe('help-admin.png');
  });

  it('omits the admin option from the main menu for a plain user role', () => {
    const content = getMenuContent('main', 'user');
    expect(content.options.some((opt) => opt.target === 'admin')).toBe(false);
  });

  it('includes the admin option from the main menu for admin and owner roles', () => {
    expect(getMenuContent('main', 'admin').options.some((opt) => opt.target === 'admin')).toBe(true);
    expect(getMenuContent('main', 'owner').options.some((opt) => opt.target === 'admin')).toBe(true);
  });

  it('non-restricted topics (stok, transaksi, etc.) are available to every role', () => {
    for (const role of ['user', 'admin', 'owner'] as const) {
      expect(getMenuContent('stok', role).topic).toBe('stok');
      expect(getMenuContent('transaksi', role).topic).toBe('transaksi');
      expect(getMenuContent('confirmation', role).topic).toBe('confirmation');
    }
  });
});

describe('resolveAssetPath / renderMenuText', () => {
  it('joins the configured HELP_ASSETS_PATH with the asset filename', () => {
    const path = resolveAssetPath('help-main.png');
    expect(path.endsWith('help-main.png')).toBe(true);
  });

  it('renders numbered options and always mentions !back and !cancel', () => {
    const content = getMenuContent('main', 'user');
    const text = renderMenuText(content);
    expect(text).toContain('!back');
    expect(text).toContain('!cancel');
    for (const opt of content.options) {
      expect(text).toContain(`!${opt.digit} - ${opt.label}`);
    }
  });
});

describe('isHelpMenuPayload', () => {
  it('accepts a well-formed help_menu payload', () => {
    expect(isHelpMenuPayload({ kind: 'help_menu', topic: 'main', history: [] })).toBe(true);
    expect(isHelpMenuPayload({ kind: 'help_menu', topic: 'stok', history: ['main'] })).toBe(true);
  });

  it('rejects non-help_menu or malformed payloads', () => {
    expect(isHelpMenuPayload(null)).toBe(false);
    expect(isHelpMenuPayload(undefined)).toBe(false);
    expect(isHelpMenuPayload({ kind: 'confirmation' })).toBe(false);
    expect(isHelpMenuPayload({ kind: 'help_menu', topic: 'main' })).toBe(false);
    expect(isHelpMenuPayload({ kind: 'help_menu', topic: 123, history: [] })).toBe(false);
    expect(isHelpMenuPayload({ kind: 'help_menu', topic: 'main', history: [1, 2] })).toBe(false);
  });
});
