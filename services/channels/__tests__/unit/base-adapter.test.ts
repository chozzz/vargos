import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AdapterDeps } from '../../contracts.js';
import { BaseChannelAdapter } from '../../base-adapter.js';

// Mock implementation of BaseChannelAdapter for testing
class TestAdapter extends BaseChannelAdapter {
  readonly type = 'test' as const;

  constructor() {
    const deps: AdapterDeps = { onInbound: async () => {} };
    super('test-instance', 'test', deps);
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async send(_sessionKey: string, _text: string): Promise<void> {}
  protected async sendTypingIndicator(_sessionKey: string): Promise<void> {}
}

describe('BaseChannelAdapter', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('latestMessageId tracking', () => {
    it('stores and retrieves latest message ID for a user', () => {
      adapter['latestMessageId'].set('user-1', 'msg-123');
      expect(adapter.extractLatestMessageId('user-1')).toBe('msg-123');
    });

    it('updates message ID for same user', () => {
      adapter['latestMessageId'].set('user-1', 'msg-123');
      adapter['latestMessageId'].set('user-1', 'msg-456');
      expect(adapter.extractLatestMessageId('user-1')).toBe('msg-456');
    });

    it('tracks different users independently', () => {
      adapter['latestMessageId'].set('user-1', 'msg-a');
      adapter['latestMessageId'].set('user-2', 'msg-b');
      expect(adapter.extractLatestMessageId('user-1')).toBe('msg-a');
      expect(adapter.extractLatestMessageId('user-2')).toBe('msg-b');
    });

    it('returns undefined for user with no message', () => {
      expect(adapter.extractLatestMessageId('unknown-user')).toBeUndefined();
    });
  });
});
