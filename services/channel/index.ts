/**
 * Channel service — manages external messaging adapters.
 *
 * Callable: channel.send, channel.sendMedia, channel.list, channel.get, channel.register
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
import type { Bus, Service } from '../../core/types.js';
import type { AppConfig, ChannelEntry } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { stripMarkdown } from '../../lib/util.js';
import { parseChannelTarget } from '../../lib/session-key.js';
import { filterPaginate, ListSchema, type ListParams } from '../../lib/paginate.js';
import type { ChannelAdapter, ChannelProvider, NormalizedInboundMessage, AdapterDeps } from './types.js';
import { deliverReply } from './delivery.js';
import { extractMediaPaths } from './media-paths.js';
import { InboundMessagePipeline, type PipelineSession } from './pipeline.js';
import { loadProviders } from './provider-loader.js';

const log = createLogger('channels');
const TOOL_ARGS_PREVIEW_CHARS = 160;

interface ChannelInfo { id: string; type: string; status: string }
type AgentToolPayload =
  | { sessionKey: string; toolName: string; phase: 'start'; args: unknown }
  | { sessionKey: string; toolName: string; phase: 'end'; result: unknown };
type AgentCompletedPayload =
  | { sessionKey: string; success: true; response: string }
  | { sessionKey: string; success: false; error: string };

function formatToolLog(payload: AgentToolPayload): string {
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

  has(type: string): boolean {
    return this.providers.has(type);
  }

  types(): string[] {
    return [...this.providers.keys()];
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

export const BOOT_PRIORITY = 70; // telegram / whatsapp listeners — listeners last
export class ChannelService implements Service {
  readonly name = 'channel';
  private adapters = new Map<string, ChannelAdapter>();
  private activeSessions = new Map<string, PipelineSession>();
  private registry = new ChannelRegistry();
  private bus!: Bus;
  private config!: AppConfig;
  private pipeline!: InboundMessagePipeline;

  async init(bus: Bus): Promise<void> {
    this.bus = bus;
    this.config = await bus.call<AppConfig>('config.get', {});
    this.pipeline = new InboundMessagePipeline(bus, this.config);

    this.registerMethods(bus);
    bus.on('agent.onTool', (p: AgentToolPayload) => this.onAgentTool(p));
    bus.on('agent.onCompleted', (p: AgentCompletedPayload) => this.onAgentCompleted(p));

    await this.registerProviders();
    // Skip live adapter startup for one-shot CLI calls — `channel.*` methods are `live`
    // and refused without a daemon, so there is nothing to connect for.
    if (!process.env.VARGOS_CLI_ONESHOT) await this.startAllConfigured();
  }

  async dispose(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try { await adapter.stop(); } catch { /* best effort */ }
    }
    this.adapters.clear();
  }

  private registerMethods(bus: Bus): void {
    bus.register('channel.send', {
      description: 'Send a text message to a channel recipient. Optional `fromSessionKey` records the text in the target session history.',
      schema: z.object({
        sessionKey: z.string(),
        text: z.string(),
        fromSessionKey: z.string().optional(),
      }),
      cli: { positional: ['sessionKey', 'text'] },
      live: true,
    }, (p) => this.send(p));

    bus.register('channel.sendMedia', {
      description: 'Send a media file to a channel recipient.',
      schema: z.object({
        sessionKey: z.string(),
        filePath: z.string(),
        mimeType: z.string(),
        caption: z.string().optional(),
      }),
      cli: { positional: ['sessionKey', 'filePath', 'mimeType'] },
      live: true,
    }, (p) => this.sendMedia(p));

    bus.register('channel.list', {
      description: 'List connected channel adapters.',
      schema: ListSchema,
      cli: { positional: ['query'] },
      live: true,
    }, (p) => this.list(p));

    bus.register('channel.get', {
      description: 'Get status of a specific channel adapter.',
      schema: z.object({ id: z.string() }),
      cli: { positional: ['id'] },
      live: true,
    }, (p) => this.get(p));

    bus.register('channel.restart', {
      description: 'Restart a channel adapter (stop + start). For WhatsApp: run `channel pair` first, then call this.',
      schema: z.object({ id: z.string() }),
      cli: { positional: ['id'] },
      live: true,
    }, (p) => this.restart(p));

    bus.register('channel.register', {
      description: 'Register a channel adapter and persist it to config. `type` must match a loaded provider (e.g. telegram, whatsapp).',
      schema: z.object({
        id: z.string(),
        type: z.string(),
        enabled: z.boolean().optional(),
        model: z.string().optional(),
        debounceMs: z.number().int().min(0).optional(),
        allowFrom: z.array(z.string()).optional(),
        cwd: z.string().optional(),
        botToken: z.string().optional(),
        persist: z.boolean().optional().describe('Persist to config.json (default true). Set false for an ephemeral runtime-only adapter.'),
      }),
      cli: { positional: ['type', 'id'] },
      live: true,
    }, (p) => this.registerChannel(p));
  }

  private async registerProviders(): Promise<void> {
    const providers = await loadProviders();
    for (const provider of providers) {
      this.registry.register(provider);
    }
  }

  // ── Callable handlers ────────────────────────────────────────────────────────

  private async send(params: { sessionKey: string; text: string; fromSessionKey?: string }): Promise<{ sent: boolean }> {
    const { sessionKey, text, fromSessionKey } = params;
    const target = parseChannelTarget(sessionKey);
    if (!target) throw new Error(`Invalid session key: ${sessionKey}`);

    const adapter = this.adapters.get(target.channel);
    if (!adapter) throw new Error(`No adapter for channel: ${target.channel}`);

    log.debug(`send: ${sessionKey} (${text.length} chars) channel=${target.channel}`);
    const cleaned = stripMarkdown(text);
    await deliverReply((chunk) => adapter.send(sessionKey, chunk), cleaned);

    // Mark session as replied so onAgentCompleted knows agent sent its own reply
    const session = this.activeSessions.get(sessionKey);
    if (session) session.replied = true;

    log.debug(`send: completed ${sessionKey}`);

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

  private async sendMedia(params: { sessionKey: string; filePath: string; mimeType: string; caption?: string }): Promise<{ sent: boolean }> {
    const { sessionKey, filePath, mimeType, caption } = params;
    const target = parseChannelTarget(sessionKey);
    if (!target) throw new Error(`Invalid session key: ${sessionKey}`);

    const adapter = this.adapters.get(target.channel);
    if (!adapter) throw new Error(`No adapter for channel: ${target.channel}`);
    if (!adapter.sendMedia) throw new Error(`Channel ${target.channel} does not support media`);

    await adapter.sendMedia(sessionKey, filePath, mimeType, caption);
    return { sent: true };
  }

  private list(params: ListParams) {
    const all: ChannelInfo[] = Array.from(this.adapters.values()).map(a => ({
      id: a.instanceId,
      type: a.type,
      status: a.status,
    }));
    return filterPaginate(all, params, c => [c.id, c.type]);
  }

  private async get(params: { id: string }): Promise<ChannelInfo> {
    const adapter = this.adapters.get(params.id);
    if (!adapter) throw new Error(`No adapter for channel: ${params.id}`);
    return { id: adapter.instanceId, type: adapter.type, status: adapter.status };
  }

  private async restart(params: { id: string }): Promise<{ restarted: boolean; id: string }> {
    const adapter = this.adapters.get(params.id);
    if (!adapter) throw new Error(`No adapter for channel: ${params.id}`);
    log.info(`restarting channel: ${params.id}`);
    await adapter.stop();
    await adapter.start();
    log.info(`channel restarted: ${params.id} (status=${adapter.status})`);
    return { restarted: true, id: params.id };
  }

  private async registerChannel(
    params: ChannelEntry & { persist?: boolean },
  ): Promise<{ id: string; type: string; started: boolean; persisted: boolean }> {
    if (!this.registry.has(params.type)) {
      throw new Error(`Unknown channel type: ${params.type}. Loaded providers: ${this.registry.types().join(', ')}`);
    }
    const { persist, ...entry } = params;
    if (this.adapters.has(params.id)) {
      log.info(`channel already registered: ${params.id}`);
      return { id: params.id, type: params.type, started: false, persisted: false };
    }
    await this.startChannel(entry);

    // Persist by default so a CLI/RPC registration survives the process; the daemon
    // picks it up on next load. Pass persist:false for an ephemeral runtime-only adapter.
    let persisted = false;
    if (persist !== false) {
      const config = await this.bus.call<AppConfig>('config.get', {});
      if (!config.channels.some(c => c.id === entry.id)) {
        await this.bus.call('config.set', { ...config, channels: [...config.channels, entry] });
        persisted = true;
      }
    }
    return { id: entry.id, type: entry.type, started: true, persisted };
  }

  // ── Agent event handlers ──────────────────────────────────────────────────────

  private onAgentTool(payload: AgentToolPayload): void {
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

  private onAgentCompleted(payload: AgentCompletedPayload): void {
    if (!payload.sessionKey || payload.sessionKey.includes(':subagent')) return;

    const session = this.activeSessions.get(payload.sessionKey);
    if (!session) {
      // Non-channel session (cron, webhook, etc.) — expected, ignore.
      log.debug(`onAgentCompleted: session not found: ${payload.sessionKey}`);
      return;
    }

    // agent.onCompleted (pi's agent_end) fires once at the true end of the run — even with
    // steering, where a second message's agent.execute settles early. So THIS is the cleanup
    // anchor, not the execute promise: claim + remove the session now. The captured `session`
    // object still serves the async reply send + reaction seal below. `completed` guards the
    // pipeline catch against a double-send.
    session.completed = true;
    this.activeSessions.delete(payload.sessionKey);

    const sessionKey = payload.sessionKey;
    const text = payload.success ? (payload.response ?? '') : `Error: ${payload.error || 'Unknown error'}`;
    log.info(`→ ${sessionKey} ${payload.success ? '✓' : '✗'} (${text.length} chars)`);

    // Send on error (always), or on a successful response the agent didn't already deliver
    // via the channel-send tool.
    const shouldSend = !payload.success || (!session.replied && !!payload.response);
    const finalize = () => this.pipeline.finalize(session, sessionKey, payload.success !== false);

    if (!shouldSend) { finalize(); return; }

    this.bus.call<{ sent: boolean }>('channel.send', { sessionKey, text })
      .then(({ sent }) => log.debug(`→ ${sessionKey} sent=${sent}`))
      .catch(err => log.error(`failed to send reply: ${toMessage(err)}`))
      .finally(finalize);
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
    log.debug(`onInboundMessage: Running pipeline process for ${sessionKey}`);
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
        this.bus.call<{ text: string }>('media.transcribeAudio', { filePath }).then(r => r.text),
      describe: (filePath: string) =>
        this.bus.call<{ description: string }>('media.describeImage', { filePath }).then(r => r.description),
      extract: (filePath: string, mimeType: string) =>
        this.bus.call<{ text: string }>('media.extractDocument', { filePath, mimeType }),
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

export function createService(): Service {
  return new ChannelService();
}
