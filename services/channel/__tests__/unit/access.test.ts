/**
 * Access rules:
 * - No allowFrom configured → always execute (permissive default)
 * - Empty allowFrom → block everyone (an explicit whitelist with no entries)
 * - Private chat: whitelisted → execute
 * - Group chat: whitelisted AND mentioned → execute; otherwise observe only
 */
import { describe, it, expect } from 'vitest';
import { isAllowed, shouldExecute } from '../../access.js';

describe('isAllowed', () => {
  it('allows everyone when no whitelist is configured', () => {
    expect(isAllowed(undefined, '+1234567890')).toBe(true);
  });

  it('blocks everyone when the whitelist is configured but empty', () => {
    expect(isAllowed([], '+1234567890')).toBe(false);
  });

  it('ignores a leading + on either side', () => {
    expect(isAllowed(['1234567890'], '+1234567890')).toBe(true);
    expect(isAllowed(['+1234567890'], '1234567890')).toBe(true);
  });

  it('matches a bare number against a full JID sender', () => {
    expect(isAllowed(['1234567890'], '1234567890@s.whatsapp.net')).toBe(true);
    expect(isAllowed(['1234567890'], '210994982838335@lid')).toBe(false);
  });

  it('matches a full JID entry exactly', () => {
    expect(isAllowed(['210994982838335@lid'], '210994982838335@lid')).toBe(true);
  });

  it('rejects a sender not on the list', () => {
    expect(isAllowed(['9999999999'], '+1234567890')).toBe(false);
  });
});

describe('shouldExecute', () => {
  it('runs for any sender in private chat when no whitelist is configured', () => {
    expect(shouldExecute(undefined, '+1234567890', 'private', false)).toBe(true);
  });

  // Without this an unconfigured bot would answer every line in every group it joins.
  it('still requires a mention in groups when no whitelist is configured', () => {
    expect(shouldExecute(undefined, '+1234567890', 'group', false)).toBe(false);
    expect(shouldExecute(undefined, '+1234567890', 'group', true)).toBe(true);
  });

  it('runs in private chat for a whitelisted sender, mention or not', () => {
    expect(shouldExecute(['1234567890'], '+1234567890', 'private', false)).toBe(true);
  });

  it('does not run in private chat for an outsider', () => {
    expect(shouldExecute(['9999999999'], '+1234567890', 'private', false)).toBe(false);
  });

  it('runs in a group only when whitelisted and mentioned', () => {
    expect(shouldExecute(['1234567890'], '+1234567890', 'group', true)).toBe(true);
    expect(shouldExecute(['1234567890'], '+1234567890', 'group', false)).toBe(false);
    expect(shouldExecute(['9999999999'], '+1234567890', 'group', true)).toBe(false);
    expect(shouldExecute(['9999999999'], '+1234567890', 'group', false)).toBe(false);
  });
});
