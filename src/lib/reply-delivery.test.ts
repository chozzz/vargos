import { describe, it, expect, vi } from 'vitest';
import { chunkText, deliverReply } from './reply-delivery.js';

describe('chunkText', () => {
  it('should return single chunk for short text', () => {
    expect(chunkText('hello', 100)).toEqual(['hello']);
  });

  it('should split on paragraph boundaries', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const chunks = chunkText(text, 20);
    expect(chunks).toEqual(['First paragraph.', 'Second paragraph.']);
  });

  it('should split on sentence boundaries when no paragraphs', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = chunkText(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk should end cleanly
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it('should hard-cut when no good boundary found', () => {
    const text = 'a'.repeat(100);
    const chunks = chunkText(text, 30);
    expect(chunks.length).toBe(4);
  });
});

describe('deliverReply', () => {
  it('should send short messages in one call', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await deliverReply(send, 'hello', { maxChunkSize: 100 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('hello');
  });

  it('should retry on failure', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);

    await deliverReply(send, 'hello', {
      maxRetries: 2,
      retryBaseMs: 10,
    });

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries exhausted', async () => {
    const send = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(
      deliverReply(send, 'hello', { maxRetries: 1, retryBaseMs: 10 }),
    ).rejects.toThrow('fail');
  });
});
