/**
 * Base channel adapter — shared logic for typing indicators, debounce, and dedupe.
 */

import type { ChannelAdapter, ChannelType, OnInboundMessageFn } from './types.js';
import type { ChannelStatus } from '../../gateway/events.js';
import { createDedupeCache } from '../../lib/dedupe.js';
import { createMessageDebouncer } from '../../lib/debounce.js';
import { createLogger } from '../../lib/logger.js';

export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract readonly type: ChannelType;
  readonly instanceId: string;
  status: ChannelStatus = 'disconnected';

  protected dedupe = createDedupeCache({ ttlMs: 120_000 });
  protected debouncer: ReturnType<typeof createMessageDebouncer>;
  protected allowFrom: Set<string> | null;
  protected onInboundMessage?: OnInboundMessageFn;
  protected typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  protected typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  protected typingFailures = new Map<string, number>();
  protected readonly log;

  private static readonly TYPING_TTL_MS = 120_000;
  private static readonly TYPING_FAILURE_LIMIT = 3;

  constructor(
    instanceId: string,
    _channelType: ChannelType,
    allowFrom?: string[],
    onInboundMessage?: OnInboundMessageFn,
    debounceMs?: number,
  ) {
    this.instanceId = instanceId;
    this.allowFrom = allowFrom?.length ? new Set(allowFrom) : null;
    this.onInboundMessage = onInboundMessage;
    this.log = createLogger(instanceId);
    this.debouncer = createMessageDebouncer(
      (id, messages) => {
        this.handleBatch(id, messages).catch((err) => {
          this.log.error(`handleBatch error for ${id}: ${err}`);
        });
      },
      { delayMs: debounceMs ?? 2000 },
    );
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(recipientId: string, text: string): Promise<void>;

  protected abstract sendTypingIndicator(recipientId: string): Promise<void>;

  startTyping(recipientId: string): void {
    if (this.typingIntervals.has(recipientId)) return;

    const typing = async () => {
      try {
        await this.sendTypingIndicator(recipientId);
        this.typingFailures.delete(recipientId);
      } catch {
        const failures = (this.typingFailures.get(recipientId) ?? 0) + 1;
        this.typingFailures.set(recipientId, failures);
        if (failures >= BaseChannelAdapter.TYPING_FAILURE_LIMIT) {
          this.stopTyping(recipientId);
        }
      }
    };

    void typing();
    this.typingIntervals.set(recipientId, setInterval(() => void typing(), 4000));
    this.typingTimeouts.set(
      recipientId,
      setTimeout(() => this.stopTyping(recipientId), BaseChannelAdapter.TYPING_TTL_MS),
    );
  }

  stopTyping(recipientId: string): void {
    const interval = this.typingIntervals.get(recipientId);
    if (interval) { clearInterval(interval); this.typingIntervals.delete(recipientId); }
    const timeout = this.typingTimeouts.get(recipientId);
    if (timeout) { clearTimeout(timeout); this.typingTimeouts.delete(recipientId); }
    this.typingFailures.delete(recipientId);
  }

  protected async routeToService(userId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.onInboundMessage) {
      this.log.error('No inbound message handler');
      return;
    }
    await this.onInboundMessage(this.instanceId, userId, content, metadata);
  }

  protected async handleBatch(id: string, messages: string[]): Promise<void> {
    const text = messages.join('\n');
    this.log.info(`batch for ${this.instanceId}:${id}: "${text.slice(0, 80)}"`);
    await this.routeToService(id, text);
  }

  protected cleanupTimers(): void {
    this.debouncer.flushAll();
    for (const interval of this.typingIntervals.values()) clearInterval(interval);
    this.typingIntervals.clear();
    for (const timeout of this.typingTimeouts.values()) clearTimeout(timeout);
    this.typingTimeouts.clear();
    this.typingFailures.clear();
  }
}
