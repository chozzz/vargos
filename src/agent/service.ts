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
import { stripHeartbeatToken } from '../lib/heartbeat.js';
import { parseTarget } from '../lib/channel-target.js';
import { isSubagentSessionKey } from '../lib/errors.js';
import { type PiAgentRuntime, type PiAgentConfig, type PiAgentRunResult } from './runtime.js';

const log = createLogger('agent');
import type { AgentStreamEvent } from './lifecycle.js';
import { resolveWorkspaceDir, resolveDataDir } from '../config/paths.js';
import { loadConfig, resolveModel, type VargosConfig } from '../config/pi-config.js';
import { loadContextFiles } from '../config/workspace.js';
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

  constructor(config: AgentServiceConfig) {
    super({
      service: 'agent',
      methods: ['agent.run', 'agent.abort', 'agent.status'],
      events: ['run.started', 'run.delta', 'run.completed'],
      subscriptions: ['message.received', 'cron.trigger'],
      gatewayUrl: config.gatewayUrl,
    });
    this.runtime = config.runtime;
    this.workspaceDir = config.workspaceDir ?? resolveWorkspaceDir();
    this.dataDir = config.dataDir ?? resolveDataDir();
  }

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    const p = params as Record<string, unknown>;

    switch (method) {
      case 'agent.run':
        return this.runAgent(p as unknown as AgentRunParams);

      case 'agent.abort': {
        const success = this.runtime.abortRun(p.runId as string, p.reason as string | undefined);
        return { aborted: success };
      }

      case 'agent.status': {
        const runs = this.runtime.listActiveRuns();
        return { activeRuns: runs };
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
        this.handleCronTrigger(p).catch((err) =>
          log.error(`Error handling cron trigger: ${err}`),
        );
        break;
    }
  }

  private async runAgent(params: AgentRunParams, vargosConfig?: VargosConfig | null): Promise<PiAgentRunResult> {
    const config = await this.buildRunConfig(params, vargosConfig);

    this.emit('run.started', { sessionKey: params.sessionKey, runId: config.runId });

    // Subscribe to streaming events
    const streamCleanup = this.subscribeToStream(config.runId!);

    try {
      const result = await this.runtime.run(config);

      this.emit('run.completed', {
        sessionKey: params.sessionKey,
        runId: config.runId,
        success: result.success,
        response: result.response?.slice(0, 500),
      });

      // If sub-agent completed, announce to parent and re-trigger
      if (isSubagentSessionKey(params.sessionKey) && result.success && !params.retrigger) {
        this.handleSubagentCompletion(params.sessionKey, result)
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

    const config = await loadConfig(this.dataDir);
    const images = metadata?.images as Array<{ data: string; mimeType: string }> | undefined;
    const media = metadata?.media as MediaAttachment | undefined;

    // Preprocess media → may rewrite task or bail early
    const task = await this.preprocessMedia(media, content, config, channel, userId);
    if (task === null) return;

    const result = await this.runAgent({
      sessionKey,
      task,
      channel,
      images,
    }, config);

    log.info(`agent result: ${sessionKey} success=${result.success} (${result.response?.length ?? 0} chars)`);

    // Reply back through the channel
    if (result.success) {
      await this.deliverToChannel(channel, userId, result);
    } else if (!result.success) {
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
        const errMsg = err instanceof Error ? err.message : String(err);
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

  private async handleCronTrigger(payload: Record<string, unknown>): Promise<void> {
    const { taskId, task, sessionKey, notify } = payload as {
      taskId: string;
      task: string;
      sessionKey: string;
      notify?: string[];
    };

    log.info(`cron trigger: ${taskId} → ${sessionKey}${notify?.length ? ` (notify: ${notify.length} targets)` : ''}`);

    // Create session so storeResponse can persist the result
    await this.call('sessions', 'session.create', {
      sessionKey,
      kind: 'cron',
      metadata: { taskId },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) log.error(`Failed to create cron session: ${msg}`);
    });

    // Store the user task so history loading picks it up
    await this.call('sessions', 'session.addMessage', {
      sessionKey, content: task, role: 'user',
      metadata: { source: 'cron', taskId },
    }).catch(() => {});

    const result = await this.runAgent({ sessionKey, task });

    // Deliver to explicitly configured notify targets only
    if (!notify?.length) return;

    for (const target of notify) {
      const parsed = parseTarget(target);
      if (!parsed) continue;

      // Inject into recipient's channel session for context
      if (result.success && result.response) {
        const cleaned = stripHeartbeatToken(result.response);
        if (cleaned) {
          await this.call('sessions', 'session.addMessage', {
            sessionKey: target, content: cleaned, role: 'assistant',
            metadata: { source: 'cron', taskId },
          }).catch(() => {});
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

  /** When a sub-agent completes, announce to parent and re-trigger if channel-rooted */
  private async handleSubagentCompletion(sessionKey: string, result: PiAgentRunResult): Promise<void> {
    // Get parent key from session metadata
    const session = await this.call<{ metadata?: Record<string, unknown> }>('sessions', 'session.get', { sessionKey });
    const parentKey = session?.metadata?.parentSessionKey as string | undefined;
    if (!parentKey) return;

    // Write announcement to parent session
    const status = result.success ? 'success' : 'error';
    const summary = result.response?.slice(0, 500) ?? '(no response)';
    await this.call('sessions', 'session.addMessage', {
      sessionKey: parentKey,
      content: `## Sub-agent Complete\n\n**Session:** ${sessionKey}\n**Status:** ${status}\n**Duration:** ${result.duration ? `${(result.duration / 1000).toFixed(1)}s` : 'unknown'}\n\n**Result:**\n${summary}`,
      role: 'system',
      metadata: { type: 'subagent_announce', childSessionKey: sessionKey, success: result.success },
    }).catch(err => log.error(`Failed to announce to parent: ${err}`));

    // If root is a channel target, re-trigger parent to synthesize and deliver
    const rootKey = parentKey.split(':subagent:')[0];
    const target = parseTarget(rootKey);
    if (!target) return;

    log.info(`re-triggering parent ${parentKey} after sub-agent completion`);
    const parentResult = await this.runAgent({
      sessionKey: parentKey,
      task: 'A sub-agent completed. Review the results above and continue.',
      retrigger: true,
    });
    await this.deliverToChannel(target.channel, target.userId, parentResult);
  }

  private async buildRunConfig(params: AgentRunParams, existing?: VargosConfig | null): Promise<PiAgentConfig> {
    const config = existing ?? await loadConfig(this.dataDir);
    if (!config) throw new Error('No config.json — run: vargos config');

    const primary = resolveModel(config);
    const envKey = process.env[`${primary.provider.toUpperCase()}_API_KEY`];
    const apiKey = envKey || primary.apiKey || (LOCAL_PROVIDERS.has(primary.provider) ? 'local' : undefined);

    const sessionKey = params.sessionKey;
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      sessionKey,
      workspaceDir: params.workspaceDir ?? this.workspaceDir,
      task: params.task,
      model: params.model ?? primary.model,
      provider: params.provider ?? primary.provider,
      apiKey,
      baseUrl: primary.baseUrl,
      maxTokens: primary.maxTokens,
      contextWindow: primary.contextWindow,
      contextFiles: await loadContextFiles(this.workspaceDir),
      images: params.images,
      channel: params.channel,
      bootstrapOverrides: params.bootstrapOverrides,
      compaction: config.compaction,
      runId,
    };
  }

  private subscribeToStream(runId: string): () => void {
    const handler = (event: AgentStreamEvent) => {
      if (event.runId !== runId) return;
      if (event.type === 'assistant') {
        this.emit('run.delta', { runId, delta: event.content });
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
  /** Set by handleSubagentCompletion to prevent recursive re-triggers */
  retrigger?: boolean;
}
