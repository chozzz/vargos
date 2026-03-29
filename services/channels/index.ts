/**
 * Channel service — manages external messaging adapters.
 *
 * Callable: channel.send, channel.sendMedia, channel.search, channel.get, channel.register
 * Pure events emitted: channel.onConnected, channel.onDisconnected, channel.onInbound
 * Pure events subscribed: agent.onDelta, agent.onTool, agent.onCompleted
 *
 * Inbound flow:
 *   adapter → onInboundMessage → session create/update → expand links
 *   → emit channel.onInbound (AgentService handles the run)
 *   → start typing + init reaction controller
 *   → agent.onTool updates reaction phase
 *   → agent.onCompleted stops typing + seals reaction
 *
 * Outbound flow: channel.send → strip markdown → chunk → adapter.send
 */

import { z } from 'zod';
import { on } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, ChannelInfo, Pagination } from '../../gateway/events.js';
import type { AppConfig, ChannelEntry, TelegramChannel, WhatsAppChannel } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { stripMarkdown } from '../../lib/strip-markdown.js';
import { channelSessionKey } from '../../lib/subagent.js';
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
  userId: string;
  reactionController?: StatusReactionController;
}

// ── ChannelService ─────────────────────────────────────────────────────────────

export class ChannelService {
  private adapters = new Map<string, ChannelAdapter>();
  // sessionKey → active typing/reaction state
  private activeSessions = new Map<string, ActiveSession>();
  // pending messageId per sessionKey (for reaction init)
  private pendingMessageIds = new Map<string, string>();

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {
    // Wire bus subscriptions
    this.bus.on('agent.onTool', (payload) => this.onAgentTool(payload));
    this.bus.on('agent.onCompleted', (payload) => this.onAgentCompleted(payload));

    // Start all configured channels after boot completes
    this.bus.on('bus.onReady', () => this.startAllConfigured());
  }

  async stop(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try { await adapter.stop(); } catch { /* best effort */ }
    }
    this.adapters.clear();
  }

  // ── Callable handlers ────────────────────────────────────────────────────────

  @on('channel.send', {
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

    await deliverReply((chunk) => adapter.send(target.userId, chunk), cleaned);

    // Passive media extraction — fallback for agent-generated file paths in text
    if (adapter.sendMedia) {
      const files = extractMediaPaths(text);
      for (const { filePath, mimeType } of files) {
        await adapter.sendMedia(target.userId, filePath, mimeType)
          .catch(err => log.error(`media send failed: ${filePath}: ${err}`));
      }
    }

    return { sent: true };
  }

  @on('channel.sendMedia', {
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

    await adapter.sendMedia(target.userId, filePath, mimeType, caption);
    return { sent: true };
  }

  @on('channel.search', {
    description: 'List connected channel adapters.',
    schema: z.object({ query: z.string().optional(), page: z.number(), limit: z.number().optional() }),
    format: (r) => {
      const res = r as EventMap['channel.search']['result'];
      return res.items.map(c => `${c.instanceId} (${c.type}) — ${c.status}`).join('\n') || 'No channels.';
    },
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

  @on('channel.get', {
    description: 'Get status of a specific channel adapter.',
    schema: z.object({ instanceId: z.string() }),
  })
  async get(params: EventMap['channel.get']['params']): Promise<EventMap['channel.get']['result']> {
    const adapter = this.adapters.get(params.instanceId);
    if (!adapter) throw new Error(`No adapter for channel: ${params.instanceId}`);
    return { instanceId: adapter.instanceId, type: adapter.type, status: adapter.status };
  }

  @on('channel.register', {
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
    if (!session?.reactionController) return;

    if (payload.phase === 'start') {
      session.reactionController.setTool();
    } else {
      session.reactionController.setThinking();
    }
  }

  private onAgentCompleted(payload: EventMap['agent.onCompleted']): void {
    const session = this.activeSessions.get(payload.sessionKey);
    if (!session) return;

    this.activeSessions.delete(payload.sessionKey);
    session.adapter.stopTyping(session.userId);

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
    channel: string,
    userId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const sessionKey = channelSessionKey(channel, userId);
    const adapter = this.adapters.get(channel);
    if (!adapter) return;

    // Session + link expansion in parallel
    const [, enrichedContent] = await Promise.all([
      this.bus.call('session.create', {
        sessionKey,
        metadata: { channel },
      }).catch((err: unknown) => {
        const msg = toMessage(err);
        if (!msg.includes('already exists')) log.error(`session.create: ${msg}`);
      }),
      expandLinks(content, this.config.linkExpand).catch(() => content),
    ]);

    // Track messageId for reaction targeting
    if (metadata?.messageId && typeof metadata.messageId === 'string') {
      this.pendingMessageIds.set(sessionKey, metadata.messageId);
    }

    // Strip base64 from session metadata to avoid bloat
    const sessionMeta: Record<string, unknown> = { type: 'task', channel, ...metadata };
    if (sessionMeta.media && typeof sessionMeta.media === 'object') {
      const { data: _data, ...rest } = sessionMeta.media as Record<string, unknown>;
      sessionMeta.media = rest;
    }
    delete sessionMeta.images;

    await this.bus.call('session.addMessage', {
      sessionKey,
      content: enrichedContent,
      role: 'user',
      metadata: sessionMeta as Record<string, import('../../gateway/events.js').Json>,
    }).catch(err => log.error(`addMessage: ${toMessage(err)}`));

    // Start typing indicator and init reaction controller
    adapter.startTyping(userId);

    const messageId = this.pendingMessageIds.get(sessionKey);
    if (messageId) this.pendingMessageIds.delete(sessionKey);

    let reactionController: StatusReactionController | undefined;
    if (adapter.react && messageId) {
      const reactFn = adapter.react.bind(adapter);
      reactionController = new StatusReactionController({ react: reactFn }, userId, messageId);
      reactionController.setThinking();
    }

    this.activeSessions.set(sessionKey, { adapter, userId, reactionController });

    log.info(`inbound: ${channel}:${userId} "${enrichedContent.slice(0, 80)}"`);

    // Emit for AgentService to pick up and run
    this.bus.emit('channel.onInbound', {
      channel,
      userId,
      sessionKey,
      content: enrichedContent,
      metadata,
    });
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
    switch (entry.type) {
      case 'telegram': {
        const cfg = entry as TelegramChannel;
        return new TelegramAdapter(
          entry.id,
          cfg.botToken,
          cfg.allowFrom,
          this.onInboundMessage.bind(this),
          cfg.debounceMs,
        );
      }
      case 'whatsapp': {
        const cfg = entry as WhatsAppChannel;
        return new WhatsAppAdapter(
          entry.id,
          cfg.allowFrom,
          this.onInboundMessage.bind(this),
          cfg.debounceMs,
        );
      }
      default:
        return null;
    }
  }

  private async startAllConfigured(): Promise<void> {
    for (const entry of this.config.channels) {
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
  bus.registerService(svc);
  log.info(`registered with ${config.channels.length} channel(s) configured (not started)`);
  return { stop: () => svc.stop() };
}
