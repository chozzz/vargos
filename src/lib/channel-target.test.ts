import { describe, it, expect } from 'vitest';
import { normalizeTarget, parseTarget } from './channel-target.js';

describe('normalizeTarget', () => {
  it('strips leading + from phone numbers', () => {
    expect(normalizeTarget('whatsapp:+61423000000')).toBe('whatsapp:61423000000');
  });

  it('leaves bare numbers unchanged', () => {
    expect(normalizeTarget('whatsapp:61423000000')).toBe('whatsapp:61423000000');
  });

  it('leaves telegram IDs unchanged', () => {
    expect(normalizeTarget('telegram:123456789')).toBe('telegram:123456789');
  });

  it('returns input unchanged if no colon', () => {
    expect(normalizeTarget('nocolon')).toBe('nocolon');
  });

  it('returns input unchanged if colon is first char', () => {
    expect(normalizeTarget(':something')).toBe(':something');
  });
});

describe('parseTarget', () => {
  it('parses whatsapp target', () => {
    expect(parseTarget('whatsapp:61423000000')).toEqual({ channel: 'whatsapp', userId: '61423000000' });
  });

  it('parses telegram target', () => {
    expect(parseTarget('telegram:123456789')).toEqual({ channel: 'telegram', userId: '123456789' });
  });

  it('returns null for missing colon', () => {
    expect(parseTarget('nocolon')).toBeNull();
  });

  it('returns null for leading colon', () => {
    expect(parseTarget(':something')).toBeNull();
  });
});
