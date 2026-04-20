/**
 * Base channel adapter — shared logic for typing indicators, debounce, and dedupe.
 */

import type { ChannelAdapter, ChannelType, OnInboundMessageFn } from './types.js';
import type { ChannelStatus } from '../../gateway/events.js';
import { createDedupeCache } from './dedupe.js';
import { createMessageDebouncer } from './debounce.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { parseSessionKey } from '../../lib/subagent.js';
import { TypingStateManager } from './typing-state.js';

export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract readonly type: ChannelType;
  readonly instanceId: string;
  status: ChannelStatus = 'disconnected';

  protected dedupe = createDedupeCache({ ttlMs: 120_000 });
  protected debouncer: ReturnType<typeof createMessageDebouncer>;
  protected allowFrom: Set<string> | null;
  protected onInboundMessage?: OnInboundMessageFn;
  protected typingState = new TypingStateManager({ ttlMs: 120_000, failureLimit: 3 });
  protected readonly log;

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
          this.log.error('handleBatch error', { id, error: toMessage(err) });
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

  startTyping(sessionKey: string, inToolExecution = false): void {
    this.typingState.start(
      sessionKey,
      () => this.sendTypingIndicator(sessionKey),
      inToolExecution,
    );
  }

  resumeTyping(sessionKey: string): void {
    this.typingState.resume(sessionKey, () => this.sendTypingIndicator(sessionKey));
  }

  stopTyping(sessionKey: string, final = true): void {
    this.typingState.stop(sessionKey, final);
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
    this.typingState.cleanup();
  }
}
