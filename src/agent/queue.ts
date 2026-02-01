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

  /**
   * Queue a message for processing
   */
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

      // Add to session queue
      if (!this.queues.has(sessionKey)) {
        this.queues.set(sessionKey, []);
      }
      this.queues.get(sessionKey)!.push(message);

      this.emit('enqueued', message);

      // Try to process immediately
      this.processQueue(sessionKey);
    });
  }

  /**
   * Check if session has queued messages
   */
  hasQueuedMessages(sessionKey: string): boolean {
    const queue = this.queues.get(sessionKey);
    return queue !== undefined && queue.length > 0;
  }

  /**
   * Check if session is currently running
   */
  isRunning(sessionKey: string): boolean {
    return this.running.has(sessionKey);
  }

  /**
   * Get queue length for session
   */
  getQueueLength(sessionKey: string): number {
    return this.queues.get(sessionKey)?.length ?? 0;
  }

  /**
   * Clear queue for a session
   */
  clearQueue(sessionKey: string): void {
    const queue = this.queues.get(sessionKey);
    if (queue) {
      // Reject all pending messages
      for (const message of queue) {
        message.reject(new Error('Queue cleared'));
      }
      this.queues.delete(sessionKey);
    }
  }

  /**
   * Process queue for a session
   * Only runs one at a time per session
   */
  private async processQueue(sessionKey: string): Promise<void> {
    // If already running, wait
    if (this.running.has(sessionKey)) {
      return;
    }

    const queue = this.queues.get(sessionKey);
    if (!queue || queue.length === 0) {
      return;
    }

    // Mark as running
    this.running.add(sessionKey);
    this.emit('started', sessionKey);

    try {
      while (queue.length > 0) {
        const message = queue.shift()!;

        this.emit('processing', message);

        try {
          // Emit 'execute' event - caller should listen and handle
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

  /**
   * Execute a message - override or listen to 'execute' event
   */
  private executeMessage(message: QueuedMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      // Emit execute event - agent runtime should listen
      this.emit('execute', message, resolve, reject);
    });
  }

}

// Global queue instance
let globalQueue: SessionMessageQueue | null = null;

export function getSessionMessageQueue(): SessionMessageQueue {
  if (!globalQueue) {
    globalQueue = new SessionMessageQueue();
  }
  return globalQueue;
}

