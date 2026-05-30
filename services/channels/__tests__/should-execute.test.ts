import { describe, it, expect } from 'vitest';

/**
 * Unit tests for shouldExecute logic.
 * Extracted from BaseChannelAdapter for isolated testing.
 *
 * Rules:
 * - No allowFrom configured → always execute
 * - Private chat: whitelisted → execute
 * - Group chat: mentioned + whitelisted → execute
 * - Otherwise → observe only
 */

function shouldExecute(
  allowFrom: string[] | undefined,
  userId: string,
  chatType: string,
  isMentioned: boolean,
): boolean {
  // undefined = not configured (allow all), [] = configured but empty (block all)
  if (allowFrom === undefined) return true;
  const normalizedUser = userId.replace(/^\+/, '').replace(/@[^@]+$/, '');
  const fullJidNoPlus = userId.replace(/^\+/, '');
  const isWhitelisted = allowFrom.some(entry => {
    const normalizedEntry = entry.replace(/^\+/, '');
    return fullJidNoPlus === normalizedEntry || normalizedUser === normalizedEntry;
  });
  if (chatType === 'private') return isWhitelisted;
  return isMentioned && isWhitelisted;
}

describe('shouldExecute', () => {
  describe('no allowFrom configured', () => {
    it('always executes when undefined (permissive default)', () => {
      expect(shouldExecute(undefined, '+1234567890', 'private', false)).toBe(true);
      expect(shouldExecute(undefined, '+1234567890', 'group', false)).toBe(true);
    });

    it('blocks all when allowFrom is empty array (explicit whitelist, no entries)', () => {
      expect(shouldExecute([], '+1234567890', 'private', false)).toBe(false);
      expect(shouldExecute([], '+1234567890', 'group', true)).toBe(false);
    });
  });

  describe('private chat', () => {
    it('executes when whitelisted (numeric match)', () => {
      expect(shouldExecute(['1234567890'], '+1234567890', 'private', false)).toBe(true);
    });

    it('executes when whitelisted (JID match)', () => {
      expect(shouldExecute(['1234567890@s.whatsapp.net'], '+1234567890@s.whatsapp.net', 'private', false)).toBe(true);
    });

    it('skips when not whitelisted', () => {
      expect(shouldExecute(['9999999999'], '+1234567890', 'private', false)).toBe(false);
    });

    it('handles + prefix normalization', () => {
      expect(shouldExecute(['+1234567890'], '+1234567890', 'private', false)).toBe(true);
    });
  });

  describe('group chat', () => {
    it('executes when mentioned AND whitelisted', () => {
      expect(shouldExecute(['1234567890'], '+1234567890', 'group', true)).toBe(true);
    });

    it('skips when mentioned but not whitelisted', () => {
      expect(shouldExecute(['9999999999'], '+1234567890', 'group', true)).toBe(false);
    });

    it('skips when not mentioned (even if whitelisted)', () => {
      expect(shouldExecute(['1234567890'], '+1234567890', 'group', false)).toBe(false);
    });

    it('skips when neither mentioned nor whitelisted', () => {
      expect(shouldExecute(['9999999999'], '+1234567890', 'group', false)).toBe(false);
    });
  });

  describe('JID normalization', () => {
    it('matches JID without + prefix', () => {
      expect(shouldExecute(['1234567890@s.whatsapp.net'], '+1234567890@s.whatsapp.net', 'private', false)).toBe(true);
    });

    it('matches normalized user ID', () => {
      expect(shouldExecute(['1234567890'], '+1234567890@s.whatsapp.net', 'private', false)).toBe(true);
    });
  });
});
