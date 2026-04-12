/**
 * Channel service — manages external messaging adapters.
 *
 * Callable: channel.send, channel.sendMedia, channel.search, channel.get, channel.register
 * Pure events emitted: channel.onConnected, channel.onDisconnected, channel.onInbound
 * Pure events subscribed: agent.onDelta, agent.onTool, agent.onCompleted
 *
 * Inbound flow:
 *   adapter → onInboundMessage → expand links → typing + reactions → agent.execute → deliver
 *   → agent.onTool updates reaction phase
 *   → agent.onCompleted stops typing + seals reaction
 *
 * Outbound flow: channel.send → strip markdown → chunk → adapter.send
 */

import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, ChannelInfo } from '../../gateway/events.js';
import type { AppConfig, ChannelEntry, TelegramChannel, WhatsAppChannel } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { stripMarkdown } from '../../lib/strip-markdown.js';
import { parseSessionKey } from '../../lib/subagent.js';
import { parseTarget } from '../../lib/channel-target.js';
import { paginate } from '../../lib/paginate.js';
import type { ChannelAdapter } from './types.js';
import { deliverReply } from './delivery.js';
import { extractMediaPaths } from './media-extract.js';
import { expandLinks } from './link-expand.js';
import { StatusReactionController } from './status-reactions.js';
import { TelegramAdapter } from './telegram/adapter.js';
import { WhatsAppAdapter } from './whatsapp/adapter.js';

const log = createLogger('channels');

interface ActiveSession {
  adapter: ChannelAdapter;
  reactionController?: StatusReactionController;
}

// ── ChannelService ─────────────────────────────────────────────────────────────

export class ChannelService {
  private adapters = new Map<string, ChannelAdapter>();
  private activeSessions = new Map<string, ActiveSession>();

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {
    this.bus.on('agent.onTool', (payload) => this.onAgentTool(payload));
    this.bus.on('agent.onCompleted', (payload) => this.onAgentCompleted(payload));
    this.bus.on('bus.onReady', () => this.startAllConfigured());
  }

  async stop(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try { await adapter.stop(); } catch { /* best effort */ }
    }
    this.adapters.clear();
  }

  // ── Callable handlers ────────────────────────────────────────────────────────

  @register('channel.send', {
    description: 'Send a text message to a channel recipient.',
    schema: z.object({ sessionKey: z.string(), text: z.string() }),
  })
  async send(params: EventMap['channel.send']['params']): Promise<EventMap['channel.send']['result']> {
    const { sessionKey, text } = params;
    const target = parseTarget(sessionKey);
    if (!target) throw new Error(`Invalid session key: ${sessionKey}`);

    const adapter = this.adapters.get(target.channel);
    if (!adapter) throw new Error(`No adapter for channel: ${target.channel}`);

    const cleaned = stripMarkdown(text);
    log.info(`send: ${sessionKey} (${cleaned.length} chars)`);

    await deliverReply((chunk) => adapter.send(sessionKey, chunk), cleaned);

    if (adapter.sendMedia) {
      const files = extractMediaPaths(text);
      for (const { filePath, mimeType } of files) {
        await adapter.sendMedia(sessionKey, filePath, mimeType)
          .catch(err => log.error(`media send failed: ${filePath}: ${err}`));
      }
    }

    return { sent: true };
  }

  @register('channel.sendMedia', {
    description: 'Send a media file to a channel recipient.',
    schema: z.object({
      sessionKey: z.string(),
      filePath: z.string(),
      mimeType: z.string(),
      caption: z.string().optional(),
    }),
  })
  async sendMedia(params: EventMap['channel.sendMedia']['params']): Promise<EventMap['channel.sendMedia']['result']> {
    const { sessionKey, filePath, mimeType, caption } = params;
    const target = parseTarget(sessionKey);
    if (!target) throw new Error(`Invalid session key: ${sessionKey}`);

    const adapter = this.adapters.get(target.channel);
    if (!adapter) throw new Error(`No adapter for channel: ${target.channel}`);
    if (!adapter.sendMedia) throw new Error(`Channel ${target.channel} does not support media`);

    await adapter.sendMedia(sessionKey, filePath, mimeType, caption);
    return { sent: true };
  }

  @register('channel.search', {
    description: 'List connected channel adapters.',
    schema: z.object({ query: z.string().optional(), page: z.number(), limit: z.number().optional() }),
  })
  async search(params: EventMap['channel.search']['params']): Promise<EventMap['channel.search']['result']> {
    const all: ChannelInfo[] = Array.from(this.adapters.values()).map(a => ({
      instanceId: a.instanceId,
      type: a.type,
      status: a.status,
    }));
    const filtered = params.query
      ? all.filter(c => c.instanceId.includes(params.query!) || c.type.includes(params.query!))
      : all;
    return paginate(filtered, params.page, params.limit ?? 20);
  }

  @register('channel.get', {
    description: 'Get status of a specific channel adapter.',
    schema: z.object({ instanceId: z.string() }),
  })
  async get(params: EventMap['channel.get']['params']): Promise<EventMap['channel.get']['result']> {
    const adapter = this.adapters.get(params.instanceId);
    if (!adapter) throw new Error(`No adapter for channel: ${params.instanceId}`);
    return { instanceId: adapter.instanceId, type: adapter.type, status: adapter.status };
  }

  @register('channel.register', {
    description: 'Dynamically register a new channel adapter.',
    schema: z.object({ id: z.string(), type: z.string() }),
  })
  async register(params: EventMap['channel.register']['params']): Promise<void> {
    if (this.adapters.has(params.id)) {
      log.info(`channel already registered: ${params.id}`);
      return;
    }
    const entry = params as ChannelEntry;
    await this.startChannel(entry);

    if (params.persist) {
      const config = await this.bus.call('config.get', {});
      const exists = config.channels.some(c => c.id === entry.id);
      if (!exists) {
        await this.bus.call('config.set', {
          ...config,
          channels: [...config.channels, entry],
        });
      }
    }
  }

  // ── Agent event handlers ──────────────────────────────────────────────────────

  private onAgentTool(payload: EventMap['agent.onTool']): void {
    const session = this.activeSessions.get(payload.sessionKey);
    if (!session) return;

    if (payload.phase === 'start') {
      if (session.reactionController) {
        session.reactionController.setTool();
      }
      // Resume typing if it was paused (long-running tool)
      session.adapter.resumeTyping(payload.sessionKey);
    } else {
      if (session.reactionController) {
        session.reactionController.setThinking();
      }
    }
  }

  private onAgentCompleted(payload: EventMap['agent.onCompleted']): void {
    const session = this.activeSessions.get(payload.sessionKey);
    if (!session) return;

    this.activeSessions.delete(payload.sessionKey);
    session.adapter.stopTyping(payload.sessionKey, true);  // final=true to fully stop

    if (session.reactionController) {
      if (payload.success === false) {
        session.reactionController.setError();
      } else {
        session.reactionController.setDone();
      }
      session.reactionController.dispose();
    }
  }

  // ── Inbound message handling ─────────────────────────────────────────────────

  async onInboundMessage(
    sessionKey: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const { type: channel } = parseSessionKey(sessionKey);
    const adapter = this.adapters.get(channel);
    if (!adapter) return;

    const enrichedContent = await expandLinks(content, this.config.linkExpand).catch(() => content);

    const inboundMeta: Record<string, unknown> = { type: 'task', channel, ...metadata };
    if (inboundMeta.media && typeof inboundMeta.media === 'object') {
      const { data: _data, ...rest } = inboundMeta.media as Record<string, unknown>;
      inboundMeta.media = rest;
    }

    // Start typing with tool execution flag (will pause after 2 mins, resume on tool completion)
    adapter.startTyping(sessionKey, true);

    const messageId = metadata?.messageId && typeof metadata.messageId === 'string' ? metadata.messageId : undefined;

    let reactionController: StatusReactionController | undefined;
    if (adapter.react && messageId) {
      const userId = adapter.extractUserId(sessionKey);
      reactionController = new StatusReactionController(
        { react: adapter.react.bind(adapter) }, userId, messageId,
      );
      reactionController.setThinking();
    }

    this.activeSessions.set(sessionKey, { adapter, reactionController });

    log.info(`inbound: ${sessionKey} "${enrichedContent.slice(0, 80)}"`);

    this.runAgent(sessionKey, enrichedContent, inboundMeta, reactionController)
      .catch(err => log.error(`agent execution failed: ${toMessage(err)}`));
  }

  /**
   * Call agent.execute, deliver response, manage typing/reactions.
   */
  private async runAgent(
    sessionKey: string,
    content: string,
    metadata: Record<string, unknown>,
    reactionController?: StatusReactionController,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionKey);
    if (!session) return;

    const stopTyping = () => session.adapter.stopTyping(sessionKey);

    try {
      const executeParams: EventMap['agent.execute']['params'] = { sessionKey, task: content };
      if (metadata.model && typeof metadata.model === 'string') executeParams.model = metadata.model;
      if (metadata.thinkingLevel && typeof metadata.thinkingLevel === 'string') {
        executeParams.thinkingLevel = metadata.thinkingLevel as EventMap['agent.execute']['params']['thinkingLevel'];
      }
      if (metadata.images && Array.isArray(metadata.images)) {
        executeParams.images = metadata.images as EventMap['agent.execute']['params']['images'];
      }

      const result = await this.bus.call('agent.execute', executeParams);

      stopTyping();

      if (result.response) {
        await this.bus.call('channel.send', { sessionKey, text: result.response });
        reactionController?.setDone();
      }
    } catch (err) {
      stopTyping();
      reactionController?.setError();

      const errorMsg = toMessage(err);
      log.error(`agent execution failed: ${errorMsg}`);
      await this.bus.call('channel.send', { sessionKey, text: `Error: ${errorMsg}` });
    }
  }

  // ── Channel startup ──────────────────────────────────────────────────────────

  private async startChannel(entry: ChannelEntry): Promise<void> {
    const adapter = this.createAdapter(entry);
    if (!adapter) {
      log.warn(`unknown channel type: ${entry.type} (id=${entry.id})`);
      return;
    }

    this.adapters.set(entry.id, adapter);

    try {
      await adapter.start();
      this.bus.emit('channel.onConnected', { instanceId: entry.id, type: entry.type });
      log.info(`channel started: ${entry.id} (${entry.type})`);
    } catch (err) {
      log.error(`channel start failed: ${entry.id}: ${toMessage(err)}`);
      this.bus.emit('channel.onDisconnected', { instanceId: entry.id });
    }
  }

  private createAdapter(entry: ChannelEntry): ChannelAdapter | null {
    const audioConfig = this.getAudioTranscribeConfig();

    switch (entry.type) {
      case 'telegram': {
        const cfg = entry as TelegramChannel;
        const adapter = new TelegramAdapter(
          entry.id, cfg.botToken, cfg.allowFrom,
          this.onInboundMessage.bind(this), cfg.debounceMs,
        );
        if (audioConfig) adapter.setAudioTranscribeConfig(audioConfig);
        return adapter;
      }
      case 'whatsapp': {
        const cfg = entry as WhatsAppChannel;
        const adapter = new WhatsAppAdapter(
          entry.id, cfg.allowFrom,
          this.onInboundMessage.bind(this), cfg.debounceMs,
        );
        if (audioConfig) adapter.setAudioTranscribeConfig(audioConfig);
        return adapter;
      }
      default:
        return null;
    }
  }

  private getAudioTranscribeConfig(): { provider: string; model: string; apiKey?: string; baseUrl?: string } | undefined {
    if (!this.config.agent?.media?.audio) return undefined;
    const [provider, model] = this.config.agent.media.audio.split(':');
    if (!provider || !model) return undefined;
    const pc = this.config.providers[provider];
    if (!pc) return undefined;
    return { provider, model, apiKey: pc.apiKey, baseUrl: pc.baseUrl };
  }

  private async startAllConfigured(): Promise<void> {
    for (const entry of this.config.channels) {
      if (entry.enabled === false) {
        log.info(`channel skipped (disabled): ${entry.id}`);
        continue;
      }
      try {
        await this.startChannel(entry);
      } catch (err) {
        log.error(`failed to start channel ${entry.id}: ${toMessage(err)}`);
      }
    }
    if (this.adapters.size > 0) {
      log.info(`started ${this.adapters.size} channel(s)`);
    }
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): Promise<void> }> {
  const config = await bus.call('config.get', {});
  const svc = new ChannelService(bus, config);
  bus.bootstrap(svc);
  log.info(`registered with ${config.channels.length} channel(s) configured (not started)`);
  return { stop: () => svc.stop() };
}
