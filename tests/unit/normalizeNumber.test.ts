import { describe, it, expect } from 'vitest';
import { normalizeWhatsAppNumber } from '../../src/message-normalizer/normalizeNumber.js';

describe('normalizeWhatsAppNumber', () => {
  it('normalizes a standard @c.us JID', () => {
    expect(normalizeWhatsAppNumber('628123456789@c.us')).toBe('628123456789');
  });

  it('normalizes an @s.whatsapp.net JID', () => {
    expect(normalizeWhatsAppNumber('628123456789@s.whatsapp.net')).toBe('628123456789');
  });

  it('strips a device suffix after the colon', () => {
    expect(normalizeWhatsAppNumber('628123456789:12@c.us')).toBe('628123456789');
  });

  it('strips a leading plus sign if present', () => {
    expect(normalizeWhatsAppNumber('+628123456789@c.us')).toBe('628123456789');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalizeWhatsAppNumber('')).toBe('');
  });
});
