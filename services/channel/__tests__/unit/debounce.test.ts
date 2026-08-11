/**
 * The debouncer batches rapid messages from one chat into a single agent turn and
 * carries the newest normalized message along with them.
 */
import { describe, it, expect } from 'vitest';
import type { NormalizedInboundMessage } from '../../types.js';
import { createMessageDebouncer } from '../../debounce.js';

function message(overrides: Partial<NormalizedInboundMessage>): NormalizedInboundMessage {
  return {
    messageId: 'msg-1',
    chatId: 'chat-1',
    fromUserId: '1',
    chatType: 'private',
    isMentioned: true,
    ...overrides,
  };
}

describe('createMessageDebouncer', () => {
  it('carries the normalized message through to the flush callback', async () => {
    const flushes: Array<{ messages: string[]; normalized?: NormalizedInboundMessage }> = [];
    const debouncer = createMessageDebouncer(
      (_key, messages, normalized) => flushes.push({ messages, normalized }),
      { delayMs: 10 },
    );

    const msg = message({ messageId: 'msg-123' });
    debouncer.push('chat-1', 'hello', msg);
    await new Promise(r => setTimeout(r, 50));

    expect(flushes).toHaveLength(1);
    expect(flushes[0].normalized).toEqual(msg);
  });

  it('accumulates messages and lets the latest metadata win', async () => {
    const flushes: Array<{ messages: string[]; normalized?: NormalizedInboundMessage }> = [];
    const debouncer = createMessageDebouncer(
      (_key, messages, normalized) => flushes.push({ messages, normalized }),
      { delayMs: 10 },
    );

    debouncer.push('chat-1', 'first', message({ messageId: 'msg-1', fromUserId: 'alice' }));
    debouncer.push('chat-1', 'second', message({ messageId: 'msg-2', fromUserId: 'bob' }));
    await new Promise(r => setTimeout(r, 50));

    expect(flushes).toHaveLength(1);
    expect(flushes[0].messages).toEqual(['first', 'second']);
    expect(flushes[0].normalized?.messageId).toBe('msg-2');
    expect(flushes[0].normalized?.fromUserId).toBe('bob');
  });

  it('keeps chats independent', async () => {
    const flushes: Array<{ key: string; messages: string[] }> = [];
    const debouncer = createMessageDebouncer(
      (key, messages) => flushes.push({ key, messages }),
      { delayMs: 10 },
    );

    debouncer.push('chat-1', 'from one', message({}));
    debouncer.push('chat-2', 'from two', message({ chatId: 'chat-2' }));
    await new Promise(r => setTimeout(r, 50));

    expect(flushes).toHaveLength(2);
    expect(flushes.map(f => f.key).sort()).toEqual(['chat-1', 'chat-2']);
  });
});
