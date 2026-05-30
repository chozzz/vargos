/**
 * Base channel adapter — shared logic for typing indicators, debounce, dedupe, and media handling.
 */

import path from 'node:path';
import type { ChannelType, OnInboundMessageFn, InboundMediaSource, ChannelAdapter, NormalizedInboundMessage, AdapterDeps } from './types.js';
import type { ChannelStatus } from '../../gateway/events.js';
import { createDedupeCache } from './dedupe.js';
import { createMessageDebouncer } from './debounce.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { parseSessionKey } from '../../lib/session-key.js';
import { TypingStateManager } from './typing-state.js';
import { saveMedia } from '../../lib/media.js';
import { getDataPaths } from '../../lib/paths.js';

export const MEDIA_TYPE_LABELS: Record<string, string> = {
  audio: 'Voice message',
  video: 'Video message',
  document: 'Document',
  sticker: 'Sticker',
};

export abstract class BaseChannelAdapter<TRaw = never> implements ChannelAdapter {
  abstract readonly type: ChannelType;
  readonly instanceId: string;
  status: ChannelStatus = 'disconnected';

  protected dedupe = createDedupeCache({ ttlMs: 120_000 });
  protected debouncer: ReturnType<typeof createMessageDebouncer>;
  protected onInboundMessage?: OnInboundMessageFn;
  protected typingState = new TypingStateManager({ ttlMs: 120_000, failureLimit: 3 });
  protected readonly log;
  protected debounceMs: number;
  protected latestMessageId = new Map<string, string>();
  protected transcribeFn?: (filePath: string) => Promise<string>;
  protected describeFn?: (filePath: string) => Promise<string>;
  protected extractFn?: (filePath: string, mimeType: string) => Promise<{ text: string }>;
  protected allowFrom?: string[];

  constructor(
    instanceId: string,
    _channelType: ChannelType,
    deps: AdapterDeps,
    allowFrom?: string[],
    debounceMs?: number,
  ) {
    this.instanceId = instanceId;
    this.onInboundMessage = deps.onInbound;
    this.allowFrom = allowFrom;
    this.transcribeFn = deps.transcribe;
    this.describeFn = deps.describe;
    this.extractFn = deps.extract;
    this.log = createLogger(instanceId);
    this.debounceMs = debounceMs ?? 2000;
    this.debouncer = this.createDebouncer();
  }

  protected createDebouncer(): ReturnType<typeof createMessageDebouncer> {
    return createMessageDebouncer(
      (id, messages, normalizedMsg) => {
        this.handleBatch(id, messages, normalizedMsg as NormalizedInboundMessage | undefined).catch((err) => {
          this.log.error('handleBatch error', { id, error: toMessage(err) });
        });
      },
      { delayMs: this.debounceMs },
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

  /** Get latest message ID for a user (used for reactions). */
  extractLatestMessageId(userId: string): string | null | undefined {
    return this.latestMessageId.get(userId);
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

  protected async handleBatch(id: string, messages: string[], normalizedMsg?: NormalizedInboundMessage): Promise<void> {
    if (!this.onInboundMessage) {
      this.log.error('No inbound message handler');
      return;
    }

    if (!normalizedMsg) {
      this.log.error('No normalized message provided for batch');
      return;
    }

    const text = messages.join('\n');
    this.log.info(`batch for ${this.instanceId}:${id}: "${text.slice(0, 80)}"`);
    await this.onInboundMessage(this.buildSessionKey(id), { ...normalizedMsg, text });
  }

  protected buildSessionKey(id: string): string {
    return `${this.instanceId}:${id}`;
  }

  protected cleanupTimers(): void {
    this.debouncer.flushAll();
    this.typingState.cleanup();
  }

  /** Override to handle media resolution for your channel. Typed via the adapter's TRaw param. */
  protected async resolveMedia(_msg: TRaw): Promise<InboundMediaSource | null> {
    return null;
  }

  /**
   * Check if the agent should execute for this message.
   * Used by both media processing and agent execution decisions.
   *
   * Rules:
   * - Private chat: whitelisted user → execute
   * - Group chat: mentioned + whitelisted → execute
   * - No allowFrom configured: always execute (permissive)
   */
  shouldExecute(userId: string, chatType: string, isMentioned: boolean): boolean {
    // undefined = not configured (allow all), [] = configured but empty (block all)
    if (this.allowFrom === undefined) return true;

    const normalizedUser = userId.replace(/^\+/, '').replace(/@[^@]+$/, '');
    const fullJidNoPlus = userId.replace(/^\+/, '');
    const isWhitelisted = this.allowFrom.some(entry => {
      const normalizedEntry = entry.replace(/^\+/, '');
      // Match: full JID (no +) OR normalized numeric (no +, no @...)
      return fullJidNoPlus === normalizedEntry || normalizedUser === normalizedEntry;
    });

    if (!isWhitelisted) return false;
    if (chatType === 'private') return true;

    // Group chat: require mention. For practical purposes, any @number pattern
    // in the message counts (covers both proper mentions and manual @typing).
    return isMentioned;
  }

  /**
   * Process inbound media: save file, optionally transcribe/describe.
   * Returns caption text + saved path for routing to onInboundMessage.
   */
  protected async processInboundMedia(
    msg: TRaw,
    route: (text: string) => Promise<void>,
    sessionKey: string,
    shouldProcessMedia = true,
  ): Promise<{ caption: string; savedPath: string; mimeType: string }> {
    const source = await this.resolveMedia(msg);
    if (!source) return { caption: '', savedPath: '', mimeType: '' };

    const { buffer, mimeType, mediaType, caption, duration } = source;
    const mediaDir = path.join(getDataPaths().dataDir, 'media');
    const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir });

    // Process map: media type → [process function, fallback text, label]
    const processMap: Record<string, [fn?: (p: string, mt: string) => Promise<string | { text: string }>, fb?: string, lb?: string]> = {
      image:    [this.describeFn?.bind(this), caption || 'User sent an image.', 'Image'],
      audio:    [this.transcribeFn?.bind(this), caption || 'User sent an audio file.', 'Audio'],
      document: [this.extractFn?.bind(this), caption || 'User sent a document.', 'Document'],
    };

    const [processFn, _fb, label] = processMap[mediaType] ?? [undefined, caption || 'Media', MEDIA_TYPE_LABELS[mediaType] ?? 'Media'];

    if (shouldProcessMedia && processFn) {
      try {
        const result = await processFn(savedPath, mimeType);
        const text = typeof result === 'string' ? result : result.text;
        await route(`${text}\n\n[${label}: ${savedPath}]`);
        return { caption: text, savedPath, mimeType };
      } catch (err) {
        this.log.warn(`${label} processing failed: ${err}. Falling back to path.`);
      }
    }

    // Fallback: just include path
    const durationSuffix = duration != null ? `, ${duration}s` : '';
    const fallbackCaption = caption || `[${label}${durationSuffix}]`;
    await route(`${fallbackCaption}\n\n[${label}: ${savedPath}]`);
    return { caption: fallbackCaption, savedPath, mimeType };
  }
}
