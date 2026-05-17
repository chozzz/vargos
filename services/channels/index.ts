/**
 * Channel service — manages external messaging adapters.
 *
 * Callable: channel.send, channel.sendMedia, channel.search, channel.get, channel.register
 * Pure events emitted: channel.onConnected, channel.onDisconnected
 * Pure events subscribed: agent.onDelta, agent.onTool, agent.onCompleted
 *
 * Inbound flow:
 *   adapter → normalizer → pipeline → expand links → whitelist check → agent.execute
 *   agent.onTool updates reaction phase
 *   agent.onCompleted stops typing + seals reaction + delivers reply
 *
 * Reply routing:
 *   - Channel-triggered: agent.onCompleted looks up activeSessions, delivers to source
 *   - Non-channel (cron, etc): agent.onCompleted ignored — caller is responsible for reply delivery
 *
 * Outbound flow: channel.send → strip markdown → chunk → adapter.send
 */

import { z } from 'zod';
import { on, register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, ChannelInfo } from '../../gateway/events.js';
import type { AppConfig, ChannelEntry } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { stripMarkdown } from '../../lib/strip-markdown.js';
import { parseChannelTarget } from '../../lib/subagent.js';
import { paginate } from '../../lib/paginate.js';
import type { ChannelAdapter, ChannelProvider, NormalizedInboundMessage, AdapterDeps } from './contracts.js';
import { deliverReply } from './delivery.js';
import { extractMediaPaths } from './media-extract.js';
import { InboundMessagePipeline, type PipelineSession } from './pipeline.js';
import { loadProviders } from './provider-loader.js';

const log = createLogger('channels');
const TOOL_ARGS_PREVIEW_CHARS = 160;

function formatToolLog(payload: EventMap['agent.onTool']): string {
  const base = `agent.onTool: ${payload.sessionKey} ${payload.toolName} ${payload.phase}`;
  if (payload.phase !== 'start') return base;

  const args = JSON.stringify(payload.args);
  if (!args || args === '{}') return base;

  const preview = args.length > TOOL_ARGS_PREVIEW_CHARS
    ? `${args.slice(0, TOOL_ARGS_PREVIEW_CHARS)}...`
    : args;

  return `${base} args=${preview}`;
}

// ── Provider Registry ──────────────────────────────────────────────────────────

class ChannelRegistry {
  private providers = new Map<string, ChannelProvider>();

  register(provider: ChannelProvider): void {
    this.providers.set(provider.type, provider);
  }

  async createAdapter(entry: ChannelEntry, deps: AdapterDeps): Promise<ChannelAdapter | null> {
    const provider = this.providers.get(entry.type);
    if (!provider) {
      log.warn(`no provider for channel type: ${entry.type}`);
      return null;
    }
    return provider.createAdapter(entry.id, entry, deps);
  }
}

// ── ChannelService ─────────────────────────────────────────────────────────────

export class ChannelService {
  private adapters = new Map<string, ChannelAdapter>();
  private activeSessions = new Map<string, PipelineSession>();
  private registry = new ChannelRegistry();
  private pipeline: InboundMessagePipeline;

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {
    this.pipeline = new InboundMessagePipeline(bus, config);
  }

  async start(): Promise<void> {
    await this.registerProviders();
    this.startAllConfigured();
  }

  private async registerProviders(): Promise<void> {
    const providers = await loadProviders();
    for (const provider of providers) {
      this.registry.register(provider);
    }
  }

  async stop(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try { await adapter.stop(); } catch { /* best effort */ }
    }
    this.adapters.clear();
  }

  // ── Callable handlers ────────────────────────────────────────────────────────

  @register('channel.send', {
    description: 'Send a text message to a channel recipient. Optional `fromSessionKey` will trigger agent.appendMessage to record the text in target history.',
    schema: z.object({
      sessionKey: z.string(),
      text: z.string(),
      fromSessionKey: z.string().optional(),
    }),
  })
  async send(params: EventMap['channel.send']['params']): Promise<EventMap['channel.send']['result']> {
    const { sessionKey, text, fromSessionKey } = params;
    const target = parseChannelTarget(sessionKey);
    if (!target) throw new Error(`Invalid session key: ${sessionKey}`);

    const adapter = this.adapters.get(target.channel);
    if (!adapter) throw new Error(`No adapter for channel: ${target.channel}`);

    log.debug(`send: received text (${text.length} chars)`);
    const cleaned = stripMarkdown(text);
    log.info(`send: ${sessionKey} (${text.length} → ${cleaned.length} chars after stripMarkdown)`);

    if (cleaned.length === 0) {
      log.warn(`send: stripMarkdown resulted in empty string (original: ${text.length} chars)`);
    }

    await deliverReply((chunk) => adapter.send(sessionKey, chunk), cleaned);

    if (adapter.sendMedia) {
      const files = extractMediaPaths(text);
      for (const { filePath, mimeType } of files) {
        await adapter.sendMedia(sessionKey, filePath, mimeType)
          .catch(err => log.error(`media send failed: ${filePath}: ${err}`));
      }
    }

    if (fromSessionKey) {
      this.bus.call('agent.appendMessage', {
        sessionKey,
        content: `[${fromSessionKey}] ${text}`,
      }).catch(err => log.error(`history append to ${sessionKey} from ${fromSessionKey}: ${toMessage(err)}`));
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
    const target = parseChannelTarget(sessionKey);
    if (!target) throw new Error(`Invalid session key: ${sessionKey}`);

    const adapter = this.adapters.get(target.channel);
    if (!adapter) throw new Error(`No adapter for channel: ${target.channel}`);
    if (!adapter.sendMedia) throw new Error(`Channel ${target.channel} does not support media`);

    await adapter.sendMedia(sessionKey, filePath, mimeType, caption);
    return { sent: true };
  }

  @register('channel.search', {
    description: 'List connected channel adapters.',
    schema: z.object({
      query: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }),
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

    return paginate(filtered, params.page ?? 1, params.limit ?? 20);
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
    // Flat object required: discriminatedUnion produces type:null in JSON Schema, rejected by Anthropic API.
    schema: z.object({
      id: z.string(),
      type: z.enum(['telegram', 'whatsapp']),
      enabled: z.boolean().optional(),
      model: z.string().optional(),
      debounceMs: z.number().int().min(0).optional(),
      allowFrom: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      botToken: z.string().optional(),
      persist: z.boolean().optional(),
    }),
  })
  async register(params: EventMap['channel.register']['params']): Promise<void> {
    if (this.adapters.has(params.id)) {
      log.info(`channel already registered: ${params.id}`);
      return;
    }
    const { persist, ...entry } = params;
    await this.startChannel(entry);

    if (persist) {
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

  @on('agent.onTool')
  private onAgentTool(payload: EventMap['agent.onTool']): void {
    const session = this.activeSessions.get(payload.sessionKey);
    if (!session) return;

    if (payload.sessionKey.includes(':subagent')) {
      log.debug(`agent.onTool: subagent, skipping reaction`);
      return;
    }

    log.debug(formatToolLog(payload));

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

  @on('agent.onCompleted')
  private onAgentCompleted(payload: EventMap['agent.onCompleted']): void | Promise<void> {
    // Skip if it's a subagent session
    if (!payload.sessionKey || payload.sessionKey.includes(':subagent')) {
      return;
    }

    const session = this.activeSessions.get(payload.sessionKey);
    if (!session) {
      // Non-channel session (cron, webhook, etc.) with no active session — expected, ignore
      log.debug(`onAgentCompleted: session not found in activeSessions: ${payload.sessionKey}`);
      return;
    }

    const targetSessionKey = payload.sessionKey;
    const responseLength = payload.success && payload.response ? payload.response.length : 0;
    const responseText = payload.success
      ? payload.response || ''
      : `Error: ${payload.error || 'Unknown error'}`;

    log.info(`onAgentCompleted: ${targetSessionKey}, success=${payload.success}, responseLength=${responseLength}`);

    const cleanup = () => {
      if (session?.reactionController) {
        if (payload.success === false) {
          session.reactionController.setError();
        } else {
          session.reactionController.setDone();
        }
        session.reactionController.dispose();
      }
      session.adapter.stopTyping(targetSessionKey, true);
    };

    // Don't send empty responses on success
    if (payload.success && !payload.response) {
      log.debug(`  → skipping send: empty response on success`);
      cleanup();
      return;
    }

    this.bus.call('channel.send', { sessionKey: targetSessionKey, text: responseText })
      .then(({ sent }) => {
        log.debug(`  → response sent to ${targetSessionKey} successfully: ${sent}`);
      })
      .catch(err => log.error(`failed to send reply: ${toMessage(err)}`))
      .finally(() => {
        if (session) {
          log.debug(`  → stopping typing (session stays alive for idle cleanup)`);
          cleanup();
        }
      });
  }

  // ── Inbound message handling ─────────────────────────────────────────────────

  /**
   * Process a normalized inbound message from an adapter.
   * Called by adapters after normalizing their raw message format.
   */
  async onInboundMessage(
    sessionKey: string,
    message: NormalizedInboundMessage,
  ): Promise<void> {
    const target = parseChannelTarget(sessionKey);
    if (!target) {
      log.debug(`invalid session key: ${sessionKey}`);
      return;
    }

    const adapter = this.adapters.get(target.channel);
    if (!adapter) {
      log.debug(`no adapter for channel: ${target.channel}`);
      return;
    }

    // Delegate to pipeline for policy orchestration
    log.debug(`onInboundMessage: processing message for ${sessionKey}`);
    await this.pipeline.process(sessionKey, message, adapter, this.activeSessions);
  }

  // ── Channel startup ──────────────────────────────────────────────────────────

  private async startChannel(entry: ChannelEntry): Promise<void> {
    const adapter = await this.createAdapter(entry);
    if (!adapter) {
      log.warn(`unknown channel type: ${entry.type} (id=${entry.id})`);
      return;
    }

    this.adapters.set(entry.id, adapter);

    try {
      await adapter.start();
      log.info(`channel started: ${entry.id} (${entry.type})`);
      this.bus.emit('channel.onConnected', { instanceId: entry.id, type: entry.type });
    } catch (err) {
      log.error(`channel start failed: ${entry.id}: ${toMessage(err)}`);
      this.bus.emit('channel.onDisconnected', { instanceId: entry.id });
    }
  }

  private async createAdapter(entry: ChannelEntry): Promise<ChannelAdapter | null> {
    const deps: AdapterDeps = {
      onInbound: this.onInboundMessage.bind(this),
      transcribe: (filePath: string) =>
        this.bus.call('media.transcribeAudio', { filePath }).then(r => r.text),
      describe: (filePath: string) =>
        this.bus.call('media.describeImage', { filePath }).then(r => r.description),
      extract: (filePath: string, mimeType: string) =>
        this.bus.call('media.extractDocument', { filePath, mimeType }),
    };

    return this.registry.createAdapter(entry, deps);
  }

  private async startAllConfigured(): Promise<void> {
    log.info(`starting all configured ${this.config.channels.length} channels...`);
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
  await svc.start();
  bus.bootstrap(svc);
  return { stop: () => svc.stop() };
}
