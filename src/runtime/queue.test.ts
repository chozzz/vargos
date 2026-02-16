import { describe, it, expect, beforeEach } from 'vitest';
import { SessionMessageQueue } from './queue.js';
import type { QueuedMessage } from './queue.js';

describe('SessionMessageQueue', () => {
  let queue: SessionMessageQueue;

  beforeEach(() => {
    queue = new SessionMessageQueue();
  });

  function autoResolve(q: SessionMessageQueue, handler?: (msg: QueuedMessage) => unknown) {
    q.on('execute', (msg: QueuedMessage, resolve: (v: unknown) => void) => {
      resolve(handler ? handler(msg) : { ok: true, content: msg.content });
    });
  }

  // ---------- serial processing ----------

  it('enqueue processes messages serially', async () => {
    const order: string[] = [];

    queue.on('execute', (msg: QueuedMessage, resolve: (v: unknown) => void) => {
      order.push(msg.content);
      resolve(msg.content);
    });

    const p1 = queue.enqueue('s1', 'first');
    const p2 = queue.enqueue('s1', 'second');

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe('first');
    expect(r2).toBe('second');
    expect(order).toEqual(['first', 'second']);
  });

  // ---------- parallel sessions ----------

  it('separate sessions process independently', async () => {
    const order: string[] = [];

    queue.on('execute', (msg: QueuedMessage, resolve: (v: unknown) => void) => {
      order.push(`${msg.sessionKey}:${msg.content}`);
      resolve(msg.content);
    });

    const p1 = queue.enqueue('s1', 'a');
    const p2 = queue.enqueue('s2', 'b');

    await Promise.all([p1, p2]);

    expect(order).toContain('s1:a');
    expect(order).toContain('s2:b');
  });

  // ---------- isRunning ----------

  it('isRunning returns true during execution, false after', async () => {
    let runningDuringExec = false;

    queue.on('execute', (msg: QueuedMessage, resolve: (v: unknown) => void) => {
      runningDuringExec = queue.isRunning(msg.sessionKey);
      resolve(null);
    });

    expect(queue.isRunning('s1')).toBe(false);
    await queue.enqueue('s1', 'test');

    expect(runningDuringExec).toBe(true);
    expect(queue.isRunning('s1')).toBe(false);
  });

  // ---------- hasQueuedMessages ----------

  it('hasQueuedMessages is true while items wait', async () => {
    // Block first message so second one sits in queue
    let unblock!: () => void;
    const gate = new Promise<void>((r) => { unblock = r; });

    queue.on('execute', async (msg: QueuedMessage, resolve: (v: unknown) => void) => {
      if (msg.content === 'first') await gate;
      resolve(null);
    });

    const p1 = queue.enqueue('s1', 'first');
    const p2 = queue.enqueue('s1', 'second');

    // Wait a tick for the first message to start executing
    await new Promise((r) => setTimeout(r, 10));

    // At this point 'second' is queued while 'first' runs
    expect(queue.hasQueuedMessages('s1')).toBe(true);

    unblock();
    await Promise.all([p1, p2]);

    expect(queue.hasQueuedMessages('s1')).toBe(false);
  });

  // ---------- getQueueLength ----------

  it('getQueueLength reflects queue size', async () => {
    let unblock!: () => void;
    const gate = new Promise<void>((r) => { unblock = r; });

    queue.on('execute', async (_msg: QueuedMessage, resolve: (v: unknown) => void) => {
      await gate;
      resolve(null);
    });

    const p1 = queue.enqueue('s1', 'a');
    const p2 = queue.enqueue('s1', 'b');
    const p3 = queue.enqueue('s1', 'c');

    // Wait for first to start processing
    await new Promise((r) => setTimeout(r, 10));

    // 'a' is executing, 'b' and 'c' are queued
    expect(queue.getQueueLength('s1')).toBe(2);

    unblock();
    await Promise.all([p1, p2, p3]);

    expect(queue.getQueueLength('s1')).toBe(0);
  });

  // ---------- clearQueue ----------

  it('clearQueue rejects all pending messages', async () => {
    let unblock!: () => void;
    const gate = new Promise<void>((r) => { unblock = r; });

    queue.on('execute', async (_msg: QueuedMessage, resolve: (v: unknown) => void) => {
      await gate;
      resolve('done');
    });

    const p1 = queue.enqueue('s1', 'running');
    const p2 = queue.enqueue('s1', 'pending1');
    const p3 = queue.enqueue('s1', 'pending2');

    // Wait for first to start executing
    await new Promise((r) => setTimeout(r, 10));

    // Clear the queue — pending messages should reject
    queue.clearQueue('s1');

    // Let the running one finish
    unblock();

    const r1 = await p1;
    expect(r1).toBe('done');

    await expect(p2).rejects.toThrow('Queue cleared');
    await expect(p3).rejects.toThrow('Queue cleared');
  });

  // ---------- lifecycle events ----------

  it('emits enqueued, processing, started, completed events', async () => {
    const events: string[] = [];

    queue.on('enqueued', () => events.push('enqueued'));
    queue.on('processing', () => events.push('processing'));
    queue.on('started', () => events.push('started'));
    queue.on('completed', () => events.push('completed'));

    autoResolve(queue);

    await queue.enqueue('s1', 'msg');

    expect(events).toEqual(['enqueued', 'started', 'processing', 'completed']);
  });

  // ---------- execute handler errors ----------

  it('execute handler errors reject the enqueue promise', async () => {
    queue.on('execute', (_msg: QueuedMessage, _resolve: unknown, reject: (e: Error) => void) => {
      reject(new Error('handler failure'));
    });

    await expect(queue.enqueue('s1', 'boom')).rejects.toThrow('handler failure');
  });
});
