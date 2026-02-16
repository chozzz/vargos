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

import { ServiceClient } from '../client.js';
import { createLogger } from '../../lib/logger.js';
import { stripHeartbeatToken } from '../../lib/heartbeat.js';
import { type PiAgentRuntime, type PiAgentConfig, type PiAgentRunResult } from '../../runtime/runtime.js';

const log = createLogger('agent');
import type { AgentStreamEvent } from '../../runtime/lifecycle.js';
import { resolveSessionFile, resolveWorkspaceDir, resolveDataDir } from '../../config/paths.js';
import { loadConfig } from '../../config/pi-config.js';
import { loadContextFiles } from '../../config/workspace.js';
import { LOCAL_PROVIDERS } from '../../config/validate.js';

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

  private async runAgent(params: AgentRunParams): Promise<PiAgentRunResult> {
    const config = await this.buildRunConfig(params);

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

      return result;
    } finally {
      streamCleanup();
    }
  }

  private async handleInboundMessage(payload: Record<string, unknown>): Promise<void> {
    const { channel, userId, sessionKey, content } = payload as {
      channel: string;
      userId: string;
      sessionKey: string;
      content: string;
    };

    const result = await this.runAgent({
      sessionKey,
      task: content,
      channel,
    });

    // Reply back through the channel (strip HEARTBEAT_OK token)
    if (result.success && result.response) {
      const cleaned = stripHeartbeatToken(result.response);
      if (cleaned === null) return; // pure HEARTBEAT_OK → skip delivery
      await this.call('channel', 'channel.send', {
        channel,
        userId,
        text: cleaned,
      }).catch((err) =>
        log.error(`Failed to send reply: ${err}`),
      );
    }
  }

  private async handleCronTrigger(payload: Record<string, unknown>): Promise<void> {
    const { taskId, task, sessionKey } = payload as {
      taskId: string;
      task: string;
      sessionKey: string;
    };

    log.debug(`cron trigger: ${taskId}`);

    const result = await this.runAgent({ sessionKey, task });

    // Broadcast to all configured channels
    if (result.success && result.response) {
      const cleaned = stripHeartbeatToken(result.response);
      if (cleaned === null) return; // pure HEARTBEAT_OK → skip broadcast
      await this.broadcastToChannels(cleaned);
    }
  }

  private async broadcastToChannels(text: string): Promise<void> {
    const config = await loadConfig(this.dataDir);
    if (!config?.channels) return;

    for (const [channel, entry] of Object.entries(config.channels)) {
      if (entry.enabled === false) continue;
      if (!entry.allowFrom?.length) continue;

      for (const userId of entry.allowFrom) {
        await this.call('channel', 'channel.send', { channel, userId, text }).catch((err) =>
          log.error(`Failed to broadcast to ${channel}:${userId}: ${err}`),
        );
      }
    }
  }

  private async buildRunConfig(params: AgentRunParams): Promise<PiAgentConfig> {
    const config = await loadConfig(this.dataDir);
    if (!config) throw new Error('No config.json — run: vargos config');

    const { provider, model } = config.agent;
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    const apiKey = envKey || config.agent.apiKey || (LOCAL_PROVIDERS.has(provider) ? 'local' : undefined);

    const sessionKey = params.sessionKey;
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      sessionKey,
      sessionFile: resolveSessionFile(sessionKey),
      workspaceDir: params.workspaceDir ?? this.workspaceDir,
      model: params.model ?? model,
      provider: params.provider ?? provider,
      apiKey,
      baseUrl: config.agent.baseUrl,
      contextFiles: await loadContextFiles(this.workspaceDir),
      images: params.images,
      channel: params.channel,
      bootstrapOverrides: params.bootstrapOverrides,
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
}
