/**
 * Base channel adapter — shared logic for WhatsApp, Telegram, etc.
 * Handles: dedupe, debounce, typing indicators, message routing, batch handling
 */

import type { ChannelAdapter, ChannelType, ChannelStatus, OnInboundMessageFn } from './types.js';
import { createDedupeCache } from '../lib/dedupe.js';
import { createMessageDebouncer } from '../lib/debounce.js';
import { createLogger } from '../lib/logger.js';

export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract readonly type: ChannelType;
  status: ChannelStatus = 'disconnected';

  protected dedupe = createDedupeCache({ ttlMs: 120_000 });
  protected debouncer: ReturnType<typeof createMessageDebouncer>;
  protected allowFrom: Set<string> | null;
  protected onInboundMessage?: OnInboundMessageFn;
  protected typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  protected typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  protected typingFailures = new Map<string, number>();
  protected readonly log;

  constructor(channelType: ChannelType, allowFrom?: string[], onInboundMessage?: OnInboundMessageFn) {
    this.allowFrom = allowFrom?.length ? new Set(allowFrom) : null;
    this.onInboundMessage = onInboundMessage;
    this.log = createLogger(channelType);
    this.debouncer = createMessageDebouncer(
      (id, messages) => {
        this.handleBatch(id, messages).catch((err) => {
          this.log.error(`handleBatch error for ${id}: ${err}`);
        });
      },
      { delayMs: 1500 },
    );
  }

  abstract initialize(): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(recipientId: string, text: string): Promise<void>;

  /** Subclass implements the platform-specific typing API call */
  protected abstract sendTypingIndicator(recipientId: string): Promise<void>;

  private static readonly TYPING_TTL_MS = 120_000;
  private static readonly TYPING_FAILURE_LIMIT = 3;

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

    // Auto-stop after TTL to prevent zombie indicators
    this.typingTimeouts.set(
      recipientId,
      setTimeout(() => this.stopTyping(recipientId), BaseChannelAdapter.TYPING_TTL_MS),
    );
  }

  stopTyping(recipientId: string): void {
    const interval = this.typingIntervals.get(recipientId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(recipientId);
    }
    const timeout = this.typingTimeouts.get(recipientId);
    if (timeout) {
      clearTimeout(timeout);
      this.typingTimeouts.delete(recipientId);
    }
    this.typingFailures.delete(recipientId);
  }

  protected async routeToService(userId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.onInboundMessage) {
      this.log.error('No inbound message handler — cannot process message');
      return;
    }
    await this.onInboundMessage(this.type, userId, content, metadata);
  }

  protected async handleBatch(id: string, messages: string[]): Promise<void> {
    const text = messages.join('\n');
    this.log.info(`batch for ${this.type}:${id}: "${text.slice(0, 80)}"`);
    await this.routeToService(id, text);
  }

  protected cleanupTimers(): void {
    this.debouncer.cancelAll();
    for (const interval of this.typingIntervals.values()) clearInterval(interval);
    this.typingIntervals.clear();
    for (const timeout of this.typingTimeouts.values()) clearTimeout(timeout);
    this.typingTimeouts.clear();
    this.typingFailures.clear();
  }
}
