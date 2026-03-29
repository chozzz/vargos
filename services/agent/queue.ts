/**
 * Session message queue
 * Per-session serialization to prevent race conditions
 */

import { EventEmitter } from 'node:events';

export interface QueuedMessage {
  id: string;
  sessionKey: string;
  content: string;
  role: 'user' | 'system';
  metadata?: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Per-session message queue
 * Ensures one run at a time per session
 */
export class SessionMessageQueue extends EventEmitter {
  private queues = new Map<string, QueuedMessage[]>();
  private running = new Set<string>();

  async enqueue<T>(
    sessionKey: string,
    content: string,
    role: 'user' | 'system' = 'user',
    metadata?: Record<string, unknown>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const message: QueuedMessage = {
        id: `${sessionKey}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        sessionKey,
        content,
        role,
        metadata,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      if (!this.queues.has(sessionKey)) {
        this.queues.set(sessionKey, []);
      }
      this.queues.get(sessionKey)!.push(message);

      this.emit('enqueued', message);
      this.processQueue(sessionKey);
    });
  }

  hasQueuedMessages(sessionKey: string): boolean {
    const queue = this.queues.get(sessionKey);
    return queue !== undefined && queue.length > 0;
  }

  isRunning(sessionKey: string): boolean {
    return this.running.has(sessionKey);
  }

  getQueueLength(sessionKey: string): number {
    return this.queues.get(sessionKey)?.length ?? 0;
  }

  clearQueue(sessionKey: string): void {
    const queue = this.queues.get(sessionKey);
    if (queue) {
      for (const message of queue) {
        message.reject(new Error('Queue cleared'));
      }
      this.queues.delete(sessionKey);
    }
  }

  private async processQueue(sessionKey: string): Promise<void> {
    if (this.running.has(sessionKey)) return;

    const queue = this.queues.get(sessionKey);
    if (!queue || queue.length === 0) return;

    this.running.add(sessionKey);
    this.emit('started', sessionKey);

    try {
      while (queue.length > 0) {
        const message = queue.shift()!;
        this.emit('processing', message);
        try {
          const result = await this.executeMessage(message);
          message.resolve(result);
        } catch (error) {
          message.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      this.running.delete(sessionKey);
      this.queues.delete(sessionKey);
      this.emit('completed', sessionKey);
    }
  }

  private executeMessage(message: QueuedMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.emit('execute', message, resolve, reject);
    });
  }
}
