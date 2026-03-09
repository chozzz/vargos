/**
 * Agent service — wraps the Pi agent runtime as a gateway service
 *
 * Methods:    agent.run, agent.abort, agent.status
 * Events:     run.started, run.delta, run.completed
 * Subscribes: message.received, cron.trigger
 *
 * This is the orchestrator: it responds to inbound messages and cron triggers
 * by running the agent, and replies via channel.send.
 */

import { ServiceClient } from '../gateway/service-client.js';
import { createLogger } from '../lib/logger.js';
import { generateId } from '../lib/id.js';
import { toMessage } from '../lib/error.js';
import { stripHeartbeatToken } from '../lib/heartbeat.js';
import { parseTarget } from '../lib/channel-target.js';
import { isSubagentSessionKey } from '../sessions/keys.js';
import { type PiAgentRuntime, type PiAgentConfig, type PiAgentRunResult } from './runtime.js';
import { parseDirectives } from '../lib/directives.js';
import { SubagentCoordinator } from './subagent-coordinator.js';

const log = createLogger('agent');
import type { AgentStreamEvent } from './lifecycle.js';
import { resolveWorkspaceDir, resolveDataDir } from '../config/paths.js';
import { loadConfig, resolveModel, type VargosConfig } from '../config/pi-config.js';
import { LOCAL_PROVIDERS } from '../config/validate.js';
import { transformMedia, type MediaAttachment } from '../lib/media-transform.js';

export interface AgentServiceConfig {
  gatewayUrl?: string;
  workspaceDir?: string;
  dataDir?: string;
  runtime: PiAgentRuntime;
}

export class AgentService extends ServiceClient {
  private runtime: PiAgentRuntime;
  private workspaceDir: string;
  private dataDir: string;
  private cachedConfig: VargosConfig | null = null;
  private configLoad: Promise<VargosConfig | null> | null = null;
  private coordinator: SubagentCoordinator;
  private stats = {
    totalTokens: { input: 0, output: 0 },
    totalToolCalls: 0,
    totalRuns: 0,
  };

  constructor(config: AgentServiceConfig) {
    super({
      service: 'agent',
      methods: ['agent.run', 'agent.abort', 'agent.status', 'agent.stats'],
      events: ['run.started', 'run.delta', 'run.completed'],
      subscriptions: ['message.received', 'cron.trigger', 'webhook.trigger'],
      gatewayUrl: config.gatewayUrl,
    });
    this.runtime = config.runtime;
    this.workspaceDir = config.workspaceDir ?? resolveWorkspaceDir();
    this.dataDir = config.dataDir ?? resolveDataDir();
    this.coordinator = new SubagentCoordinator(
      this.call.bind(this),
      (sessionKey, task) => this.runAgent({ sessionKey, task, retrigger: true }),
      this.deliverToChannel.bind(this),
      this.deliverToNotifyTargets.bind(this),
    );
  }

  async disconnect(): Promise<void> {
    this.coordinator.clearTimers();
    return super.disconnect();
  }

  /** Returns cached config, loading on first call. Concurrent callers share one load. */
  private async getConfig(): Promise<VargosConfig | null> {
    if (this.cachedConfig) return this.cachedConfig;
    if (!this.configLoad) {
      this.configLoad = loadConfig(this.dataDir).then(cfg => {
        this.cachedConfig = cfg;
        this.configLoad = null;
        return cfg;
      });
    }
    return this.configLoad;
  }

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    const p = params as Record<string, unknown>;

    switch (method) {
      case 'agent.run':
        return this.runAgent(p as unknown as AgentRunParams);

      case 'agent.abort': {
        if (p.sessionKey) {
          const count = this.runtime.abortSessionRuns(p.sessionKey as string, p.reason as string | undefined);
          return { aborted: count > 0, count };
        }
        const success = this.runtime.abortRun(p.runId as string, p.reason as string | undefined);
        return { aborted: success };
      }

      case 'agent.status': {
        const runs = this.runtime.listActiveRuns();
        return { activeRuns: runs };
      }

      case 'agent.stats': {
        const activeRuns = this.runtime.listActiveRuns();
        return {
          ...this.stats,
          activeRuns: activeRuns.length,
        };
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  handleEvent(event: string, payload: unknown): void {
    const p = payload as Record<string, unknown>;

    switch (event) {
      case 'message.received':
        this.handleInboundMessage(p).catch((err) =>
          log.error(`Error handling message: ${err}`),
        );
        break;

      case 'cron.trigger':
      case 'webhook.trigger':
        this.handleTrigger(event, p).catch((err) =>
          log.error(`Error handling ${event}: ${err}`),
        );
        break;
    }
  }

  private async runAgent(params: AgentRunParams, vargosConfig?: VargosConfig | null): Promise<PiAgentRunResult> {
    const config = await this.buildRunConfig(params, vargosConfig);

    this.stats.totalRuns++;
    this.emit('run.started', { sessionKey: params.sessionKey, runId: config.runId });

    // Subscribe to streaming events (including tool call tracking)
    const streamCleanup = this.subscribeToStream(config.runId!);

    try {
      const result = await this.runtime.run(config);

      // Accumulate token usage
      if (result.tokensUsed) {
        this.stats.totalTokens.input += result.tokensUsed.input;
        this.stats.totalTokens.output += result.tokensUsed.output;
      }

      this.emit('run.completed', {
        sessionKey: params.sessionKey,
        runId: config.runId,
        success: result.success,
        response: result.response?.slice(0, 500),
      });

      // If sub-agent completed, announce to parent and batch re-trigger
      if (isSubagentSessionKey(params.sessionKey) && result.success && !params.retrigger) {
        this.coordinator.handleSubagentCompletion(params.sessionKey, result)
          .catch(err => log.error(`subagent completion failed: ${err}`));
      }

      return result;
    } finally {
      streamCleanup();
    }
  }

  private async handleInboundMessage(payload: Record<string, unknown>): Promise<void> {
    const { channel, userId, sessionKey, content, metadata } = payload as {
      channel: string;
      userId: string;
      sessionKey: string;
      content: string;
      metadata?: Record<string, unknown>;
    };

    log.info(`inbound message: ${channel}:${userId} → ${sessionKey}`);

    const config = await this.getConfig();
    const images = metadata?.images as Array<{ data: string; mimeType: string }> | undefined;
    const media = metadata?.media as MediaAttachment | undefined;

    // Preprocess media → may rewrite task or bail early
    const rawTask = await this.preprocessMedia(media, content, config, channel, userId);
    if (rawTask === null) return;

    const directives = parseDirectives(rawTask);
    // Fall back to original if stripping left nothing (e.g. directive-only message)
    const task = directives.cleaned || rawTask;

    const result = await this.runAgent({
      sessionKey,
      task,
      channel,
      images,
      thinkingLevel: directives.thinkingLevel,
      verbose: directives.verbose,
    }, config);

    log.info(`agent result: ${sessionKey} success=${result.success} (${result.response?.length ?? 0} chars)`);

    // Reply back through the channel
    if (result.success) {
      await this.deliverToChannel(channel, userId, result);
    } else {
      const errMsg = result.error
        ? `Something went wrong: ${result.error.slice(0, 200)}`
        : 'Something went wrong — please try again.';
      await this.call('channel', 'channel.send', { channel, userId, text: errMsg })
        .catch((err) => log.error(`Failed to send error reply: ${err}`));
    }
  }

  /** Transform media attachment before agent run. Returns rewritten task or null to bail. */
  private async preprocessMedia(
    media: MediaAttachment | undefined,
    content: string,
    config: VargosConfig | null,
    channel: string,
    userId: string,
  ): Promise<string | null> {
    if (!media) return content;

    const mediaModelName = config?.agent?.media?.[media.type];

    if (mediaModelName) {
      try {
        const profile = resolveModel(config!, mediaModelName);
        const envKey = process.env[`${profile.provider.toUpperCase()}_API_KEY`];
        const apiKey = envKey || profile.apiKey;
        const transformed = await transformMedia(media, { ...profile, apiKey });
        return media.type === 'audio'
          ? transformed
          : `[Image description: ${transformed}]\n\n${content}`;
      } catch (err) {
        log.error(`media transform failed: ${err}`);
        const errMsg = toMessage(err);
        await this.call('channel', 'channel.send', {
          channel, userId,
          text: `Failed to process ${media.type}: ${errMsg.slice(0, 200)}`,
        }).catch((e) => log.error(`Failed to send transform error: ${e}`));
        return null;
      }
    }

    if (media.type !== 'image') {
      await this.call('channel', 'channel.send', {
        channel, userId,
        text: `${media.type} processing requires a model. Set agent.media.${media.type} in config.json.`,
      }).catch((err) => log.error(`Failed to send media error: ${err}`));
      return null;
    }

    // Images without a transform model fall through — primary may support vision
    return content;
  }

  private async handleTrigger(event: string, payload: Record<string, unknown>): Promise<void> {
    const kind = event.split('.')[0]; // 'cron' or 'webhook'
    const { task, sessionKey, notify } = payload as {
      task: string;
      sessionKey: string;
      notify?: string[];
    };
    const triggerId = (payload.taskId ?? payload.hookId) as string;
    log.info(`${kind} trigger: ${triggerId} → ${sessionKey}${notify?.length ? ` (notify: ${notify.length} targets)` : ''}`);
    await this.handleTriggeredRun({ kind, triggerId, task, sessionKey, notify });
  }

  private async handleTriggeredRun({
    kind,
    triggerId,
    task,
    sessionKey,
    notify,
  }: {
    kind: string;
    triggerId: string;
    task: string;
    sessionKey: string;
    notify?: string[];
  }): Promise<void> {
    const idKey = kind === 'cron' ? 'taskId' : 'hookId';

    await this.call('sessions', 'session.create', {
      sessionKey,
      kind,
      metadata: { [idKey]: triggerId, ...(notify?.length && { notify }) },
    }).catch((err: unknown) => {
      const msg = toMessage(err);
      if (!msg.includes('already exists')) log.error(`Failed to create ${kind} session: ${msg}`);
    });

    await this.call('sessions', 'session.addMessage', {
      sessionKey, content: task, role: 'user',
      metadata: { source: kind, [idKey]: triggerId },
    }).catch(err => log.error(`Failed to store ${kind} task message: ${err}`));

    let result = await this.runAgent({ sessionKey, task });

    // Retry once on empty response (e.g. thinking-only from weaker models)
    if (result.success && !result.response) {
      log.info(`empty response for ${kind}:${triggerId} — retrying once`);
      result = await this.runAgent({ sessionKey, task });
    }

    if (!notify?.length) return;

    // If subagents were spawned, skip — coordinator.routeParentResult handles delivery after re-trigger
    const prefix = sessionKey + ':subagent:';
    const hasSubagents = this.runtime.listActiveRuns().some(r => r.sessionKey?.startsWith(prefix));
    if (hasSubagents) {
      log.info(`${kind}:${triggerId} spawned sub-agents — deferring delivery`);
      return;
    }

    await this.deliverToNotifyTargets(notify, result);
  }

  /** Deliver result to notify targets — writes session message + sends to channel */
  private async deliverToNotifyTargets(notify: string[], result: PiAgentRunResult): Promise<void> {
    for (const target of notify) {
      const parsed = parseTarget(target);
      if (!parsed) continue;

      if (result.success && result.response) {
        const cleaned = stripHeartbeatToken(result.response);
        if (cleaned) {
          await this.call('sessions', 'session.addMessage', {
            sessionKey: target, content: cleaned, role: 'assistant',
          }).catch(err => log.error(`Failed to store notify message: ${err}`));
        }
      }

      await this.deliverToChannel(parsed.channel, parsed.userId, result);
    }
  }

  /** Send a successful agent result to a channel (strips heartbeat token) */
  private async deliverToChannel(channel: string, userId: string, result: PiAgentRunResult): Promise<void> {
    if (!result.success || !result.response) return;
    const cleaned = stripHeartbeatToken(result.response);
    if (cleaned === null) return;
    await this.call('channel', 'channel.send', { channel, userId, text: cleaned })
      .catch(err => log.error(`Failed to send reply: ${err}`));
    log.info(`reply sent: ${channel}:${userId}`);
  }

  private async buildRunConfig(params: AgentRunParams, existing?: VargosConfig | null): Promise<PiAgentConfig> {
    const config = existing ?? await this.getConfig();
    if (!config) throw new Error('No config.json — run: vargos config');

    const primary = resolveModel(config);
    const envKey = process.env[`${primary.provider.toUpperCase()}_API_KEY`];
    const apiKey = envKey || primary.apiKey || (LOCAL_PROVIDERS.has(primary.provider) ? 'local' : undefined);

    const sessionKey = params.sessionKey;
    const runId = generateId('run');

    const workspaceDir = params.workspaceDir ?? this.workspaceDir;
    const boundary = config.fsBoundary;
    const fsBoundary =
      boundary?.enabled !== false ? workspaceDir : undefined;
    const fsBoundaryAllowlist = boundary?.allowlist;

    return {
      sessionKey,
      workspaceDir,
      task: params.task,
      model: params.model ?? primary.model,
      provider: params.provider ?? primary.provider,
      apiKey,
      baseUrl: primary.baseUrl,
      maxTokens: primary.maxTokens,
      contextWindow: primary.contextWindow,
      images: params.images,
      channel: params.channel,
      bootstrapOverrides: params.bootstrapOverrides,
      compaction: config.compaction,
      thinkingLevel: params.thinkingLevel,
      verbose: params.verbose,
      runId,
      fsBoundary,
      fsBoundaryAllowlist,
    };
  }

  private subscribeToStream(runId: string): () => void {
    const handler = (event: AgentStreamEvent) => {
      if (event.runId !== runId) return;
      if (event.type === 'assistant') {
        this.emit('run.delta', { runId, sessionKey: event.sessionKey, type: 'text_delta', data: event.content });
      } else if (event.type === 'tool') {
        if (event.phase === 'start') this.stats.totalToolCalls++;
        this.emit('run.delta', { runId, sessionKey: event.sessionKey, type: `tool_${event.phase}`, data: event.toolName });
      }
    };

    this.runtime.onStream(handler);

    return () => {
      this.runtime.offStream(handler);
    };
  }
}

interface AgentRunParams {
  sessionKey: string;
  task?: string;
  model?: string;
  provider?: string;
  workspaceDir?: string;
  images?: Array<{ data: string; mimeType: string }>;
  channel?: string;
  bootstrapOverrides?: Record<string, string>;
  thinkingLevel?: string;
  verbose?: boolean;
  /** Set by handleSubagentCompletion to prevent recursive re-triggers */
  retrigger?: boolean;
}
