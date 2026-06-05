/**
 * Base channel adapter — shared logic for typing indicators, debounce, dedupe, and media handling.
 */
import path from 'node:path';
import { createDedupeCache } from './dedupe.js';
import { createMessageDebouncer } from './debounce.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { parseSessionKey } from '../../lib/session-key.js';
import { TypingStateManager } from './typing-state.js';
import { saveMedia } from '../../lib/media.js';
import { getDataPaths } from '../../lib/paths.js';
export const MEDIA_TYPE_LABELS = {
    audio: 'Voice message',
    video: 'Video message',
    document: 'Document',
    sticker: 'Sticker',
};
export class BaseChannelAdapter {
    instanceId;
    status = 'disconnected';
    dedupe = createDedupeCache({ ttlMs: 120_000 });
    debouncer;
    onInboundMessage;
    typingState = new TypingStateManager({ ttlMs: 120_000, failureLimit: 3 });
    log;
    debounceMs;
    latestMessageId = new Map();
    transcribeFn;
    describeFn;
    extractFn;
    allowFrom;
    constructor(instanceId, _channelType, deps, allowFrom, debounceMs) {
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
    createDebouncer() {
        return createMessageDebouncer((id, messages, normalizedMsg) => {
            this.handleBatch(id, messages, normalizedMsg).catch((err) => {
                this.log.error('handleBatch error', { id, error: toMessage(err) });
            });
        }, { delayMs: this.debounceMs });
    }
    /** Extract userId from sessionKey for adapter-specific use. */
    extractUserId(sessionKey) {
        const { id } = parseSessionKey(sessionKey);
        return id;
    }
    /** Get latest message ID for a user (used for reactions). */
    extractLatestMessageId(userId) {
        return this.latestMessageId.get(userId);
    }
    startTyping(sessionKey, inToolExecution = false) {
        this.typingState.start(sessionKey, () => this.sendTypingIndicator(sessionKey), inToolExecution);
    }
    resumeTyping(sessionKey) {
        this.typingState.resume(sessionKey, () => this.sendTypingIndicator(sessionKey));
    }
    stopTyping(sessionKey, final = true) {
        this.typingState.stop(sessionKey, final);
    }
    async handleBatch(id, messages, normalizedMsg) {
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
    buildSessionKey(id) {
        return `${this.instanceId}:${id}`;
    }
    cleanupTimers() {
        this.debouncer.flushAll();
        this.typingState.cleanup();
    }
    /** Override to handle media resolution for your channel. Typed via the adapter's TRaw param. */
    async resolveMedia(_msg) {
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
    shouldExecute(userId, chatType, isMentioned) {
        // undefined = not configured (allow all), [] = configured but empty (block all)
        if (this.allowFrom === undefined)
            return true;
        const normalizedUser = userId.replace(/^\+/, '').replace(/@[^@]+$/, '');
        const fullJidNoPlus = userId.replace(/^\+/, '');
        const isWhitelisted = this.allowFrom.some(entry => {
            const normalizedEntry = entry.replace(/^\+/, '');
            // Match: full JID (no +) OR normalized numeric (no +, no @...)
            return fullJidNoPlus === normalizedEntry || normalizedUser === normalizedEntry;
        });
        if (!isWhitelisted)
            return false;
        if (chatType === 'private')
            return true;
        // Group chat: require mention. For practical purposes, any @number pattern
        // in the message counts (covers both proper mentions and manual @typing).
        return isMentioned;
    }
    /**
     * Process inbound media: save file, optionally transcribe/describe.
     * Returns caption text + saved path for routing to onInboundMessage.
     */
    async processInboundMedia(msg, route, sessionKey, shouldProcessMedia = true) {
        const source = await this.resolveMedia(msg);
        if (!source)
            return { caption: '', savedPath: '', mimeType: '' };
        const { buffer, mimeType, mediaType, caption, duration } = source;
        const mediaDir = path.join(getDataPaths().dataDir, 'media');
        const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir });
        // Process map: media type → [process function, fallback text, label]
        const processMap = {
            image: [this.describeFn?.bind(this), caption || 'User sent an image.', 'Image'],
            audio: [this.transcribeFn?.bind(this), caption || 'User sent an audio file.', 'Audio'],
            document: [this.extractFn?.bind(this), caption || 'User sent a document.', 'Document'],
        };
        const [processFn, _fb, label] = processMap[mediaType] ?? [undefined, caption || 'Media', MEDIA_TYPE_LABELS[mediaType] ?? 'Media'];
        if (shouldProcessMedia && processFn) {
            try {
                const result = await processFn(savedPath, mimeType);
                const text = typeof result === 'string' ? result : result.text;
                await route(`${text}\n\n[${label}: ${savedPath}]`);
                return { caption: text, savedPath, mimeType };
            }
            catch (err) {
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
//# sourceMappingURL=base-adapter.js.map