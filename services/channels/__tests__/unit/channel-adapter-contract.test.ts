import { describe, it, expect } from 'vitest';
import type { ChannelAdapter, AdapterDeps } from '../../contracts.js';
import { BaseChannelAdapter } from '../../base-adapter.js';

const noDeps: AdapterDeps = { onInbound: async () => {} };

/**
 * Adapter without typing support (implements sendTypingIndicator as no-op).
 * Even channels without native typing must implement the interface for consistency.
 */
class NoTypingAdapter extends BaseChannelAdapter {
  readonly type = 'no-typing' as const;

  constructor() {
    super('no-typing-1', 'no-typing', noDeps);
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async send(_sessionKey: string, _text: string): Promise<void> {}
  protected async sendTypingIndicator(_sessionKey: string): Promise<void> {
    // No-op: this channel doesn't support typing, but the contract requires it
  }
}

/**
 * Typing-capable adapter (e.g., Telegram, WhatsApp).
 * Tracks typing state to verify lifecycle is called.
 */
class TypingCapableAdapter extends BaseChannelAdapter {
  readonly type = 'typing-capable' as const;
  typingCalls: Array<{ method: string; sessionKey: string }> = [];

  constructor() {
    super('typing-1', 'typing-capable', noDeps);
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async send(_sessionKey: string, _text: string): Promise<void> {}
  protected async sendTypingIndicator(sessionKey: string): Promise<void> {
    this.typingCalls.push({ method: 'sendTypingIndicator', sessionKey });
  }
}

describe('ChannelAdapter Contract — Typing Lifecycle', () => {
  describe('Required typing abstraction (all adapters)', () => {
    it('All adapters extending BaseChannelAdapter have typing lifecycle methods', () => {
      const adapter: ChannelAdapter = new TypingCapableAdapter();
      expect(adapter.startTyping).toBeDefined();
      expect(adapter.resumeTyping).toBeDefined();
      expect(adapter.stopTyping).toBeDefined();
    });

    it('Adapters without native typing must still implement sendTypingIndicator as no-op', () => {
      const adapter: ChannelAdapter = new NoTypingAdapter();
      // Must have typing lifecycle even for channels without native support
      expect(adapter.startTyping).toBeDefined();
      // Should not throw when called
      expect(() => {
        adapter.startTyping('session-1');
      }).not.toThrow();
    });

    it('sendTypingIndicator is the extension point for platform-specific behavior', () => {
      const adapter = new TypingCapableAdapter('typing-2', 'typing-capable');
      adapter.startTyping('session-1');
      // TypingStateManager calls the abstract sendTypingIndicator
      expect(adapter.typingCalls.length).toBeGreaterThan(0);
      expect(adapter.typingCalls[0].method).toBe('sendTypingIndicator');
    });
  });

  describe('Optional react capability (asymmetry documented)', () => {
    it('ChannelAdapter.react is optional per platform', () => {
      // React is optional because not all channels support reactions
      const adapter: ChannelAdapter = new NoTypingAdapter('no-typing-2', 'no-typing');
      expect(adapter.react).toBeUndefined();
    });

    it('Typing is required, reactions are optional — intentional asymmetry', () => {
      // Typing is universally implemented (even as no-op) for state management consistency
      // Reactions are optional because only some platforms support them
      const typingAdapter: ChannelAdapter = new TypingCapableAdapter('typing-3', 'typing-capable');
      expect(typingAdapter.startTyping).toBeDefined();
      // Note: react is platform-specific and optional (Telegram/WhatsApp implement it)
      // but not all channels need to support it
    });
  });
});
