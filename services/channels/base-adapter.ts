/**
 * Base channel adapter — shared logic for typing indicators, debounce, and dedupe.
 */

import type { ChannelAdapter, ChannelType, OnInboundMessageFn } from './types.js';
import type { ChannelStatus } from '../../gateway/events.js';
import { createDedupeCache } from '../../lib/dedupe.js';
import { createMessageDebouncer } from '../../lib/debounce.js';
import { createLogger } from '../../lib/logger.js';
import { parseSessionKey } from '../../lib/subagent.js';

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
  /** Track which users have active typing due to tool execution (for resume on completion) */
  protected typingInToolExecution = new Set<string>();
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
          this.log.error('handleBatch error', { id, error: err instanceof Error ? err.message : String(err) });
        });
      },
      { delayMs: debounceMs ?? 2000 },
    );
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(sessionKey: string, text: string): Promise<void>;

  protected abstract sendTypingIndicator(sessionKey: string): Promise<void>;

  /** Extract userId from sessionKey for adapter-specific use. */
  extractUserId(sessionKey: string): string {
    const { id } = parseSessionKey(sessionKey);
    return id;
  }

  /**
   * Start typing indicator. If currently in tool execution, resume after 2-min TTL.
   */
  startTyping(sessionKey: string, inToolExecution = false): void {
    if (this.typingIntervals.has(sessionKey)) return;

    if (inToolExecution) {
      this.typingInToolExecution.add(sessionKey);
    }

    const typing = async () => {
      try {
        await this.sendTypingIndicator(sessionKey);
        this.typingFailures.delete(sessionKey);
      } catch {
        const failures = (this.typingFailures.get(sessionKey) ?? 0) + 1;
        this.typingFailures.set(sessionKey, failures);
        if (failures >= BaseChannelAdapter.TYPING_FAILURE_LIMIT) {
          this.stopTyping(sessionKey, true);
        }
      }
    };

    void typing();
    this.typingIntervals.set(sessionKey, setInterval(() => void typing(), 4000));
    this.typingTimeouts.set(
      sessionKey,
      setTimeout(() => {
        this.pauseTyping(sessionKey);
      }, BaseChannelAdapter.TYPING_TTL_MS),
    );
  }

  /**
   * Pause typing for 2 minutes. If in tool execution, will resume when agent completes.
   * This is called automatically after 2 minutes of continuous typing.
   */
  private pauseTyping(sessionKey: string): void {
    const interval = this.typingIntervals.get(sessionKey);
    if (interval) { clearInterval(interval); this.typingIntervals.delete(sessionKey); }
    const timeout = this.typingTimeouts.get(sessionKey);
    if (timeout) { clearTimeout(timeout); this.typingTimeouts.delete(sessionKey); }
    // Note: typingFailures and typingInToolExecution are preserved for potential resume
  }

  /**
   * Resume typing after tool execution completes (called when agent.onCompleted fires).
   */
  resumeTyping(sessionKey: string): void {
    if (!this.typingInToolExecution.has(sessionKey)) return;
    // Typing was paused due to 2-min TTL, resume it
    this.startTyping(sessionKey, true);
  }

  /**
   * Stop typing completely (final stop, not just pause).
   */
  stopTyping(sessionKey: string, final = true): void {
    const interval = this.typingIntervals.get(sessionKey);
    if (interval) { clearInterval(interval); this.typingIntervals.delete(sessionKey); }
    const timeout = this.typingTimeouts.get(sessionKey);
    if (timeout) { clearTimeout(timeout); this.typingTimeouts.delete(sessionKey); }

    if (final) {
      this.typingFailures.delete(sessionKey);
      this.typingInToolExecution.delete(sessionKey);
    }
  }

  protected async routeToService(sessionKey: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.onInboundMessage) {
      this.log.error('No inbound message handler');
      return;
    }
    await this.onInboundMessage(sessionKey, content, metadata);
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
