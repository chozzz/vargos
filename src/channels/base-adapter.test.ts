import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseChannelAdapter } from './base-adapter.js';
import type { ChannelType, ChannelStatus } from './types.js';

/** Minimal concrete adapter for testing base class behavior */
class TestAdapter extends BaseChannelAdapter {
  readonly type: ChannelType = 'whatsapp';
  batches: Array<{ id: string; messages: string[] }> = [];

  constructor(onInbound?: (channel: string, userId: string, content: string) => Promise<void>, debounceMs?: number) {
    super('whatsapp', 'whatsapp', [], onInbound, debounceMs);
  }

  async initialize() { this.status = 'connected' as ChannelStatus; }
  async start() {}
  async stop() { this.cleanupTimers(); }
  async send() {}
  protected async sendTypingIndicator() {}

  protected override async handleBatch(id: string, messages: string[]): Promise<void> {
    this.batches.push({ id, messages });
  }
}

describe('BaseChannelAdapter', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('flushes pending debounced messages on stop', async () => {
    const adapter = new TestAdapter(undefined, 5000);

    adapter['debouncer'].push('user1', 'hello');
    adapter['debouncer'].push('user1', 'world');
    expect(adapter.batches).toHaveLength(0);

    // Stop should flush, not drop
    await adapter.stop();
    expect(adapter.batches).toHaveLength(1);
    expect(adapter.batches[0]).toEqual({ id: 'user1', messages: ['hello', 'world'] });
  });

  it('flushes multiple users on stop', async () => {
    const adapter = new TestAdapter(undefined, 5000);

    adapter['debouncer'].push('user1', 'msg-a');
    adapter['debouncer'].push('user2', 'msg-b');

    await adapter.stop();
    expect(adapter.batches).toHaveLength(2);

    const keys = adapter.batches.map(b => b.id).sort();
    expect(keys).toEqual(['user1', 'user2']);
  });

  it('does not double-flush after stop', async () => {
    const adapter = new TestAdapter(undefined, 500);

    adapter['debouncer'].push('user1', 'msg');
    await adapter.stop();
    expect(adapter.batches).toHaveLength(1);

    // Timer would have fired — but messages already flushed
    vi.advanceTimersByTime(1000);
    expect(adapter.batches).toHaveLength(1);
  });
});
