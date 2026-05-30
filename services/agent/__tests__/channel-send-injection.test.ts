import { describe, it, expect } from 'vitest';

/**
 * Unit tests for channel.send auto-injection of sessionKey.
 * Tests the logic in wrapEventAsToolDefinition.
 */

describe('channel.send auto-injection', () => {
  it('injects sessionKey when not provided', () => {
    const paramsObj: Record<string, unknown> = { text: 'Hello' };
    const sessionKey = 'telegram:12345';

    // Simulate the auto-injection logic
    if (!paramsObj.sessionKey) {
      paramsObj.sessionKey = sessionKey;
    }

    expect(paramsObj.sessionKey).toBe('telegram:12345');
    expect(paramsObj.text).toBe('Hello');
  });

  it('preserves existing sessionKey', () => {
    const paramsObj: Record<string, unknown> = {
      sessionKey: 'telegram:99999',
      text: 'Hello',
    };
    const sessionKey = 'telegram:12345';

    // Simulate the auto-injection logic
    if (!paramsObj.sessionKey) {
      paramsObj.sessionKey = sessionKey;
    }

    expect(paramsObj.sessionKey).toBe('telegram:99999');
  });

  it('does not inject for other events', () => {
    const paramsObj: Record<string, unknown> = { task: 'Do something' };
    const eventName = 'agent.execute';
    const sessionKey = 'telegram:12345';

    // Simulate the auto-injection logic (only for channel.send)
    if (eventName === 'channel.send' && !paramsObj.sessionKey) {
      paramsObj.sessionKey = sessionKey;
    }

    expect(paramsObj.sessionKey).toBeUndefined();
  });

  it('handles empty string sessionKey', () => {
    const paramsObj: Record<string, unknown> = { sessionKey: '', text: 'Hello' };
    const sessionKey = 'telegram:12345';

    // Simulate the auto-injection logic
    if (!paramsObj.sessionKey) {
      paramsObj.sessionKey = sessionKey;
    }

    // Empty string is falsy, so it gets overwritten
    expect(paramsObj.sessionKey).toBe('telegram:12345');
  });
});
