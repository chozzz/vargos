import { describe, it, expect } from 'vitest';
import {
  isHeartbeatContentEffectivelyEmpty,
  stripHeartbeatToken,
  isWithinActiveHours,
} from './heartbeat.js';

describe('isHeartbeatContentEffectivelyEmpty', () => {
  it('returns true for empty string', () => {
    expect(isHeartbeatContentEffectivelyEmpty('')).toBe(true);
  });

  it('returns true for headers only', () => {
    expect(isHeartbeatContentEffectivelyEmpty('# Tasks\n## Sub\n### Deep')).toBe(true);
  });

  it('returns true for empty checklist items', () => {
    expect(isHeartbeatContentEffectivelyEmpty('# Tasks\n- [ ]\n-\n')).toBe(true);
  });

  it('returns true for HTML comments only', () => {
    expect(isHeartbeatContentEffectivelyEmpty('<!-- template -->\n# Tasks\n')).toBe(true);
  });

  it('returns false for actual content', () => {
    expect(isHeartbeatContentEffectivelyEmpty('# Tasks\n- [ ] Deploy v2')).toBe(false);
  });

  it('returns false for non-empty list item', () => {
    expect(isHeartbeatContentEffectivelyEmpty('- some task')).toBe(false);
  });

  it('returns true for blank lines and whitespace', () => {
    expect(isHeartbeatContentEffectivelyEmpty('\n  \n\t\n')).toBe(true);
  });
});

describe('stripHeartbeatToken', () => {
  it('returns null for bare token', () => {
    expect(stripHeartbeatToken('HEARTBEAT_OK')).toBe(null);
  });

  it('returns null for bold-wrapped token', () => {
    expect(stripHeartbeatToken('**HEARTBEAT_OK**')).toBe(null);
  });

  it('returns null for backtick-wrapped token', () => {
    expect(stripHeartbeatToken('`HEARTBEAT_OK`')).toBe(null);
  });

  it('returns null for whitespace-padded token', () => {
    expect(stripHeartbeatToken('  HEARTBEAT_OK  \n')).toBe(null);
  });

  it('strips token from mixed response', () => {
    expect(stripHeartbeatToken('All good. HEARTBEAT_OK')).toBe('All good.');
  });

  it('passes through text without token', () => {
    expect(stripHeartbeatToken('Deploy failed, check logs')).toBe('Deploy failed, check logs');
  });

  it('returns null for strikethrough-wrapped token', () => {
    expect(stripHeartbeatToken('~~HEARTBEAT_OK~~')).toBe(null);
  });
});

describe('isWithinActiveHours', () => {
  it('returns true when no config', () => {
    expect(isWithinActiveHours()).toBe(true);
    expect(isWithinActiveHours(undefined)).toBe(true);
  });

  it('handles normal range (within)', () => {
    // Use a timezone where we can predict the result
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    const currentUTC = formatter.format(now);

    // Create a range that includes the current time
    const [h] = currentUTC.split(':').map(Number);
    const start = `${String((h - 1 + 24) % 24).padStart(2, '0')}:00`;
    const end = `${String((h + 1) % 24).padStart(2, '0')}:00`;

    // Only test normal range if it doesn't wrap overnight
    if (start < end) {
      expect(isWithinActiveHours({ start, end, timezone: 'UTC' })).toBe(true);
    }
  });

  it('handles normal range (outside)', () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    const currentUTC = formatter.format(now);
    const [h] = currentUTC.split(':').map(Number);

    // Create a range that excludes the current time
    const start = `${String((h + 2) % 24).padStart(2, '0')}:00`;
    const end = `${String((h + 4) % 24).padStart(2, '0')}:00`;

    if (start < end) {
      expect(isWithinActiveHours({ start, end, timezone: 'UTC' })).toBe(false);
    }
  });

  it('handles overnight wrap (within)', () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    const currentUTC = formatter.format(now);
    const [h] = currentUTC.split(':').map(Number);

    // Overnight range that includes current time: start after current, end after current
    const start = `${String((h - 2 + 24) % 24).padStart(2, '0')}:00`;
    const end = `${String((h + 2) % 24).padStart(2, '0')}:00`;

    if (start > end) {
      expect(isWithinActiveHours({ start, end, timezone: 'UTC' })).toBe(true);
    }
  });
});
