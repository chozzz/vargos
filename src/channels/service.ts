/**
 * Channel service — manages external messaging adapters
 *
 * Methods: channel.send, channel.status, channel.list
 * Events:  message.received, channel.connected, channel.disconnected
 * Subscribes: run.started, run.completed (for typing indicators)
 *
 * Owns adapter instances. When an adapter receives a message, the service
 * emits a message.received event. The agent service subscribes and handles it.
 */

import { ServiceClient } from '../gateway/service-client.js';
import type { ChannelAdapter } from './types.js';
import { deliverReply } from './delivery.js';
import { extractMediaPaths } from './media-extract.js';
import { channelSessionKey } from '../sessions/keys.js';
import { createLogger } from '../lib/logger.js';
import { StatusReactionController } from './status-reactions.js';
import { expandLinks } from './link-expand.js';
import type { LinkExpandConfig } from '../config/pi-config.js';

const log = createLogger('channels');

export interface ChannelServiceConfig {
  gatewayUrl?: string;
  linkExpand?: LinkExpandConfig;
}

export class ChannelService extends ServiceClient {
  private adapters = new Map<string, ChannelAdapter>();
  private typingRuns = new Map<string, string>(); // runId → channel:userId
  private reactionControllers = new Map<string, StatusReactionController>(); // runId → controller
  // Latest inbound messageId per sessionKey, for reaction targeting
  private pendingMessageIds = new Map<string, string>();
  private linkExpandConfig: LinkExpandConfig;

  constructor(config: ChannelServiceConfig = {}) {
    super({
      service: 'channel',
      methods: ['channel.send', 'channel.sendMedia', 'channel.status', 'channel.list'],
      events: ['message.received', 'channel.connected', 'channel.disconnected'],
      subscriptions: ['run.started', 'run.delta', 'run.completed'],
      gatewayUrl: config.gatewayUrl,
    });
    this.linkExpandConfig = config.linkExpand ?? {};
  }

  /**
   * Register and start an adapter. The service wires it into the event pipeline.
   */
  async addAdapter(adapter: ChannelAdapter): Promise<void> {
    this.adapters.set(adapter.type, adapter);
  }

  listAdapters(): Array<{ type: string; status: string }> {
    return Array.from(this.adapters.entries()).map(([type, a]) => ({
      type,
      status: a.status,
    }));
  }

  /**
   * Called by adapter integration code when an inbound message arrives.
   * Emits message.received for the agent service to pick up.
   */
  async onInboundMessage(channel: string, userId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    const sessionKey = channelSessionKey(channel, userId);

    // Run session creation and link expansion concurrently — both are I/O bound
    // and independent. This way expansion doesn't add latency on top of session setup.
    const [, enrichedContent] = await Promise.all([
      this.call('sessions', 'session.create', {
        sessionKey,
        kind: 'main',
        metadata: { channel },
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('already exists')) throw err;
      }),
      expandLinks(content, this.linkExpandConfig).catch(() => content),
    ]);

    // Track inbound messageId for reaction support
    if (metadata?.messageId && typeof metadata.messageId === 'string') {
      this.pendingMessageIds.set(sessionKey, metadata.messageId);
    }

    // Store user message — strip base64 data from media to avoid session bloat
    const sessionMeta: Record<string, unknown> = { type: 'task', channel, ...metadata };
    if (sessionMeta.media && typeof sessionMeta.media === 'object') {
      const { data: _data, ...rest } = sessionMeta.media as Record<string, unknown>;
      sessionMeta.media = rest;
    }
    if (sessionMeta.images) delete sessionMeta.images;

    await this.call('sessions', 'session.addMessage', {
      sessionKey,
      content: enrichedContent,
      role: 'user',
      metadata: sessionMeta,
    });

    log.info(`inbound: ${channel}:${userId} "${content.slice(0, 80)}"`);
    this.emit('message.received', { channel, userId, sessionKey, content: enrichedContent, metadata });
  }

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    const p = params as Record<string, unknown>;

    switch (method) {
      case 'channel.send': {
        const { channel, userId, text } = p as { channel: string; userId: string; text: string };
        const adapter = this.adapters.get(channel);
        if (!adapter) throw new Error(`No adapter for channel: ${channel}`);
        log.info(`send: ${channel}:${userId} (${text.length} chars)`);
        try {
          await deliverReply((chunk) => adapter.send(userId, chunk), text);
        } catch (err) {
          log.error(`send failed: ${channel}:${userId}: ${err}`);
          throw err;
        }

        // Detect and send any media file paths embedded in the text
        if (adapter.sendMedia) {
          const files = extractMediaPaths(text);
          for (const { filePath, mimeType } of files) {
            await adapter.sendMedia(userId, filePath, mimeType).catch((err: unknown) =>
              log.error(`media send failed: ${filePath}: ${err}`));
          }
        }

        return { sent: true };
      }

      case 'channel.sendMedia': {
        const { channel, userId, filePath, mimeType, caption } = p as {
          channel: string; userId: string; filePath: string; mimeType: string; caption?: string;
        };
        const adapter = this.adapters.get(channel);
        if (!adapter) throw new Error(`No adapter for channel: ${channel}`);
        if (!adapter.sendMedia) throw new Error(`Channel ${channel} does not support media`);
        log.info(`sendMedia: ${channel}:${userId} ${mimeType} ${filePath}`);
        await adapter.sendMedia(userId, filePath, mimeType, caption);
        return { sent: true };
      }

      case 'channel.status': {
        const type = p.channel as string | undefined;
        if (type) {
          const adapter = this.adapters.get(type);
          if (!adapter) throw new Error(`No adapter for channel: ${type}`);
          return { type, status: adapter.status };
        }
        return this.listAdapters();
      }

      case 'channel.list':
        return this.listAdapters();

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  handleEvent(event: string, payload: unknown): void {
    const p = payload as Record<string, unknown>;

    switch (event) {
      case 'run.started':
        this.handleRunStarted(p);
        break;
      case 'run.delta':
        this.handleRunDelta(p);
        break;
      case 'run.completed':
        this.handleRunCompleted(p);
        break;
    }
  }

  private handleRunStarted(payload: Record<string, unknown>): void {
    const { sessionKey, runId } = payload as { sessionKey: string; runId: string };
    const parsed = this.parseChannelSession(sessionKey);
    if (!parsed) return;

    const { channel, userId } = parsed;
    const adapter = this.adapters.get(channel);
    if (!adapter) return;

    adapter.startTyping(userId);
    this.typingRuns.set(runId, `${channel}:${userId}`);

    // Set up reaction controller if the adapter supports it
    const messageId = this.pendingMessageIds.get(sessionKey);
    if (adapter.react && messageId) {
      this.pendingMessageIds.delete(sessionKey);
      const reactFn = adapter.react.bind(adapter);
      const controller = new StatusReactionController({ react: reactFn }, userId, messageId);
      controller.setThinking();
      this.reactionControllers.set(runId, controller);
    }
  }

  private handleRunDelta(payload: Record<string, unknown>): void {
    const { runId, type, data } = payload as { runId: string; type: string; data: unknown };
    const controller = this.reactionControllers.get(runId);
    if (!controller) return;

    if (type === 'tool_start') {
      controller.setTool(typeof data === 'string' ? data : '');
    } else if (type === 'text_delta') {
      controller.setThinking();
    }
  }

  private handleRunCompleted(payload: Record<string, unknown>): void {
    const { runId, success } = payload as { runId: string; success?: boolean };
    const key = this.typingRuns.get(runId);
    if (!key) return;

    this.typingRuns.delete(runId);
    const parsed = this.parseChannelSession(key);
    if (!parsed) return;

    const adapter = this.adapters.get(parsed.channel);
    adapter?.stopTyping(parsed.userId);

    const controller = this.reactionControllers.get(runId);
    if (controller) {
      this.reactionControllers.delete(runId);
      if (success === false) {
        controller.setError();
      } else {
        controller.setDone();
      }
      controller.dispose();
    }
  }

  /** Extract channel + userId from a session key like "whatsapp:123" */
  private parseChannelSession(sessionKey: string): { channel: string; userId: string } | null {
    const adapters = Array.from(this.adapters.keys());
    for (const channel of adapters) {
      if (sessionKey.startsWith(`${channel}:`)) {
        const userId = sessionKey.slice(channel.length + 1);
        // Skip subagent or nested keys
        if (userId.includes(':')) return null;
        return { channel, userId };
      }
    }
    return null;
  }

  async stopAdapters(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try { await adapter.stop(); } catch { /* best effort */ }
    }
  }
}
