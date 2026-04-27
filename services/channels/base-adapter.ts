/**
 * Base channel adapter — shared logic for typing indicators, debounce, dedupe, and media handling.
 */

import path from 'node:path';
import type { ChannelType, OnInboundMessageFn, InboundMediaSource } from './types.js';
import type { ChannelAdapter, NormalizedInboundMessage, AdapterDeps } from './contracts.js';
import type { ChannelStatus } from '../../gateway/events.js';
import { createDedupeCache } from './dedupe.js';
import { createMessageDebouncer } from './debounce.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { parseSessionKey } from '../../lib/subagent.js';
import { TypingStateManager } from './typing-state.js';
import { saveMedia } from '../../lib/media.js';
import { getDataPaths } from '../../lib/paths.js';

const MEDIA_TYPE_LABELS: Record<string, string> = {
  audio: 'Voice message',
  video: 'Video message',
  document: 'Document',
  sticker: 'Sticker',
};

export abstract class BaseChannelAdapter implements ChannelAdapter {
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

  constructor(
    instanceId: string,
    _channelType: ChannelType,
    deps: AdapterDeps,
    debounceMs?: number,
  ) {
    this.instanceId = instanceId;
    this.onInboundMessage = deps.onInbound;
    this.transcribeFn = deps.transcribe;
    this.describeFn = deps.describe;
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

  /** Override to handle media resolution for your channel. */
  protected async resolveMedia(_msg: unknown): Promise<InboundMediaSource | null> {
    return null;
  }

  /**
   * Process inbound media message.
   * @param msg - Raw message from channel
   * @param sessionKey - Session key (channel:userId)
   * @param normalizedMsg - Normalized message with flags (skipAgent, etc)
   * @param route - Function to route processed text to onInboundMessage
   */
  protected async processInboundMedia(
    msg: unknown,
    sessionKey: string,
    normalizedMsg: NormalizedInboundMessage,
    route: (text: string) => Promise<void>,
  ): Promise<{ caption: string; savedPath: string; mimeType: string }> {
    const source = await this.resolveMedia(msg);
    const defaultReturn = { caption: '', savedPath: '', mimeType: '' };
    if (!source) return defaultReturn;

    const { buffer, mimeType, mediaType, caption, duration } = source;
    const mediaDir = path.join(getDataPaths().dataDir, 'media');
    const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir });

    // Skip transcription for messages agent won't process (e.g., group mentions)
    if (normalizedMsg.skipAgent) {
      const label = MEDIA_TYPE_LABELS[mediaType] ?? 'Media';
      const durationSuffix = duration != null ? `, ${duration}s` : '';
      const fallbackCaption = caption || `[${label}${durationSuffix}]`;
      await route(`${fallbackCaption}\n\n[${label} saved: ${savedPath}]`);
      return {
        caption: fallbackCaption,
        savedPath,
        mimeType
      }
    }

    if (mediaType === 'image') {
      if (this.describeFn) {
        try {
          const description = await this.describeFn(savedPath);
          await route(`${description}\n\n[Image described from: ${savedPath}]`);
          return {
            caption: description,
            savedPath,
            mimeType
          }
        } catch (err) {
          this.log.warn(`Image description failed: ${err}. Falling back to caption.`);
        }
      }
      const text = caption || 'User sent an image.';
      await route(`${text}\n\n[Image saved: ${savedPath}]`);
      return {
        caption: text,
        savedPath,
        mimeType
      }
    }

    if (mediaType === 'audio' && this.transcribeFn) {
      try {
        const transcription = await this.transcribeFn(savedPath);
        await route(`${transcription}\n\n[Audio transcribed from: ${savedPath}]`);
        return {
          caption: transcription,
          savedPath,
          mimeType
        }
      } catch (err) {
        this.log.warn(`Audio transcription failed: ${err}. Falling back to file path.`);
      }
    }

    // Default handling for audio (no transcription) or other media types
    const label = MEDIA_TYPE_LABELS[mediaType] ?? 'Media';
    const durationSuffix = duration != null ? `, ${duration}s` : '';
    const fallbackCaption = caption || `[${label}${durationSuffix}]`;
    await route(`${fallbackCaption}\n\n[${label} saved: ${savedPath}]`);
    return {
      caption: fallbackCaption,
      savedPath,
      mimeType,
    }
  }
}
