/**
 * Agent service — wraps PiAgentRuntime as a bus-registered service.
 *
 * Callable: agent.execute, agent.abort, agent.status
 * Pure events: agent.onDelta, agent.onTool, agent.onCompleted
 *
 * Subagent orchestration:
 *   When a subagent session completes, announce result to parent and debounce re-trigger.
 */

import { z } from 'zod';
import { on, register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, AgentExecuteParams } from '../../gateway/events.js';
import type { AppConfig, ModelProfile } from '../../services/config/index.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';
import { generateId } from '../../lib/id.js';
import { toMessage, classifyError, friendlyError, sanitizeError } from '../../lib/error.js';
import { appendError } from '../../lib/error-store.js';
import { stripHeartbeatToken } from '../../lib/heartbeat.js';
import { parseTarget } from '../../lib/channel-target.js';
import { isSubagentSessionKey, subagentSessionKey, canSpawnSubagent, DEFAULT_MAX_SPAWN_DEPTH, DEFAULT_RUN_TIMEOUT_SECONDS } from '../../lib/subagent.js';
import { loadAgent } from '../../lib/agents.js';
import { parseDirectives } from '../../lib/directives.js';
import { transformMedia, type MediaAttachment } from '../../lib/media.js';
import { PiAgentRuntime, type PiAgentConfig, type PiAgentRunResult } from './runtime.js';

const log = createLogger('agent');
const RETRIGGER_DEBOUNCE_MS = 3000;

// ── Model resolution ───────────────────────────────────────────────────────────

function resolveModel(config: AppConfig, name?: string): ModelProfile {
  const modelName = name ?? config.agent.model;
  const profile = config.models.find(m => m.name === modelName);
  if (!profile) {
    throw new Error(`Model profile "${modelName}" not found — available: ${config.models.map(m => m.name).join(', ')}`);
  }
  return profile;
}

function resolveApiKey(profile: ModelProfile): string | undefined {
  return process.env[`${profile.provider.toUpperCase()}_API_KEY`] || profile.apiKey;
}

// ── AgentService ───────────────────────────────────────────────────────────────

export class AgentService {
  private runtime: PiAgentRuntime;
  private retriggerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stats = {
    totalTokens: { input: 0, output: 0 },
    totalToolCalls: 0,
    totalRuns: 0,
  };

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {
    this.runtime = new PiAgentRuntime({ bus });
  }

  stop(): void {
    for (const timer of this.retriggerTimers.values()) clearTimeout(timer);
    this.retriggerTimers.clear();
  }

  @register('agent.execute', {
    description: 'Run the agent on a task. Creates/updates the session, adds the task as a user message, and returns the response.',
    schema: z.object({
      sessionKey:     z.string(),
      task:           z.string(),
      thinkingLevel:  z.string().optional(),
      model:          z.string().optional(),
      promptMode:     z.string().optional(),
      media:          z.array(z.object({ filePath: z.string(), mimeType: z.string() })).optional(),
      notify:         z.array(z.string()).optional(),
    }),
  })
  async execute(params: EventMap['agent.execute']['params']): Promise<EventMap['agent.execute']['result']> {
    let result = await this.runAgent(params);

    if (result.success && result.thinkingOnly) {
      log.info(`thinking-only response for ${params.sessionKey} — re-prompting`);
      result = await this.runAgent({ ...params, task: 'Provide your response.' });
    }

    if (!result.success) {
      const errMsg = result.error
        ? friendlyError(classifyError(result.error))
        : 'Something went wrong — please try again.';
      return { response: errMsg };
    }
    return { response: result.response ?? '' };
  }

  @register('agent.spawn', {
    description: 'Spawn a child agent session to handle a subtask. Returns immediately with the child session key.',
    schema: z.object({
      sessionKey: z.string().describe('Parent session key'),
      task:    z.string().describe('Task for the child agent to execute'),
      agent:   z.string().optional().describe('Agent definition name to load skills from'),
      role:    z.string().optional().describe('Custom role for the child agent'),
      model:   z.string().optional().describe('Model to use for the child agent'),
    }),
  })
  async spawn(params: EventMap['agent.spawn']['params']): Promise<EventMap['agent.spawn']['result']> {
    if (!canSpawnSubagent(params.sessionKey, DEFAULT_MAX_SPAWN_DEPTH)) {
      throw new Error(`Max subagent depth (${DEFAULT_MAX_SPAWN_DEPTH}) exceeded`);
    }

    const childKey = subagentSessionKey(params.sessionKey);
    const { workspaceDir } = getDataPaths();

    // Load agent definition if provided
    let agentOverride: { role?: string; model?: string } = {};
    if (params.agent) {
      const agentDef = await loadAgent(workspaceDir, params.agent);
      if (agentDef) {
        if (agentDef.model) agentOverride.model = agentDef.model;
      } else {
        log.warn(`Agent definition not found: ${params.agent}`);
      }
    }

    const childModel = params.model ?? agentOverride.model;
    const childRole = params.role;

    // Create child session with parent metadata
    await this.bus.call('session.create', {
      sessionKey: childKey,
      model: childModel,
      metadata: { parentSessionKey: params.sessionKey },
    }).catch(err => log.error(`Failed to create subagent session: ${err}`));

    // Add task as user message
    await this.bus.call('session.addMessage', {
      sessionKey: childKey,
      role: 'user',
      content: params.task,
    }).catch(err => log.error(`Failed to add subagent task message: ${err}`));

    // Fire execute in background — do not await
    const executePromise = this.bus.call('agent.execute', {
      sessionKey: childKey,
      task: params.task,
      model: childModel,
    }).catch(err => {
      log.error(`Subagent execution failed: ${err}`);
      this.bus.emit('agent.onCompleted', {
        sessionKey: childKey,
        success: false,
        error: toMessage(err),
      });
    });

    // Set timeout for abort if run exceeds limit
    const timer = setTimeout(() => {
      log.warn(`Subagent timeout: ${childKey}`);
      this.runtime.abortSessionRuns(childKey);
    }, DEFAULT_RUN_TIMEOUT_SECONDS * 1000);

    // Clean up timer when done
    executePromise.finally(() => clearTimeout(timer));

    return {
      sessionKey: childKey,
      response: `Spawned subagent session: ${childKey}`,
    };
  }

  @register('agent.abort', {
    description: 'Abort all active runs for a session.',
    schema: z.object({
      sessionKey: z.string().describe('Session identifier'),
    }),
  })
  async abort(params: EventMap['agent.abort']['params']): Promise<EventMap['agent.abort']['result']> {
    const count = this.runtime.abortSessionRuns(params.sessionKey);
    return { aborted: count > 0 };
  }

  @register('agent.status', {
    description: 'Get list of active agent runs.',
    schema: z.object({
      sessionKey: z.string().optional().describe('Filter by session key (optional)'),
    }),
  })
  async status(_params: EventMap['agent.status']['params']): Promise<EventMap['agent.status']['result']> {
    return { activeRuns: this.runtime.listActiveRuns().map(r => r.sessionKey) };
  }

  // ── Internal run logic ──────────────────────────────────────────────────────

  private async runAgent(
    params: AgentExecuteParams & { channel?: string; images?: Array<{ data: string; mimeType: string }>; bootstrapOverrides?: Record<string, string>; verbose?: boolean; retrigger?: boolean },
    overrideConfig?: AppConfig,
  ): Promise<PiAgentRunResult> {
    const appConfig = overrideConfig ?? this.config;
    const piConfig = this.buildRunConfig(params, appConfig);

    this.stats.totalRuns++;

    const streamCleanup = this.subscribeToStream(piConfig.runId!, params.sessionKey);

    try {
      const result = await this.runtime.run(piConfig);

      if (result.tokensUsed) {
        this.stats.totalTokens.input  += result.tokensUsed.input;
        this.stats.totalTokens.output += result.tokensUsed.output;
      }

      this.bus.emit('agent.onCompleted', {
        sessionKey: params.sessionKey,
        success:    result.success,
        response:   result.response?.slice(0, 500),
        error:      result.error,
      });

      if (isSubagentSessionKey(params.sessionKey) && result.success && !params.retrigger) {
        this.handleSubagentCompletion(params.sessionKey, result)
          .catch(err => log.error(`subagent completion failed: ${err}`));
      }

      return result;
    } finally {
      streamCleanup();
    }
  }

  private buildRunConfig(
    params: AgentExecuteParams & { channel?: string; images?: Array<{ data: string; mimeType: string }>; bootstrapOverrides?: Record<string, string>; verbose?: boolean },
    appConfig: AppConfig,
  ): PiAgentConfig {
    const channelEntry = params.channel
      ? appConfig.channels?.find(ch => ch.id === params.channel)
      : undefined;
    const primary = resolveModel(appConfig, params.model ?? channelEntry?.model);
    const apiKey = resolveApiKey(primary);
    const runId = generateId('run');
    const { workspaceDir } = getDataPaths();

    return {
      sessionKey:      params.sessionKey,
      workspaceDir,
      task:            params.task,
      model:           primary.model,
      provider:        primary.provider,
      apiKey,
      baseUrl:         primary.baseUrl,
      images:          params.images,
      channel:         params.channel,
      bootstrapOverrides: params.bootstrapOverrides,
      thinkingLevel:   params.thinkingLevel ?? appConfig.agent.thinkingLevel ?? 'high',
      thinkingBudgets: appConfig.agent.thinkingBudgets,
      maxRetryDelayMs: appConfig.agent.maxRetryDelayMs ?? 30_000,
      verbose:         params.verbose,
      runId,
    };
  }

  private subscribeToStream(runId: string, sessionKey: string): () => void {
    const handler = (event: import('./lifecycle.js').AgentStreamEvent) => {
      if (event.runId !== runId) return;

      if (event.type === 'assistant') {
        this.bus.emit('agent.onDelta', { sessionKey, chunk: event.content });
      } else if (event.type === 'tool') {
        if (event.phase === 'start') this.stats.totalToolCalls++;
        this.bus.emit('agent.onTool', {
          sessionKey,
          toolName: event.toolName,
          phase:    event.phase,
          args:     event.args as import('../../gateway/events.js').Json | undefined,
          result:   event.result as import('../../gateway/events.js').Json | undefined,
        });
      }
    };

    this.runtime.onStream(handler);
    return () => this.runtime.offStream(handler);
  }

  // ── Channel message handling ────────────────────────────────────────────────

  async handleChannelMessage(payload: {
    channel: string;
    userId: string;
    sessionKey: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { channel, userId, sessionKey, content, metadata } = payload;
    log.info(`inbound message: ${channel}:${userId} → ${sessionKey}`);

    const images = metadata?.images as Array<{ data: string; mimeType: string }> | undefined;
    const media = metadata?.media as MediaAttachment | undefined;

    const rawTask = await this.preprocessMedia(media, content, channel, userId);
    if (rawTask === null) return;

    if (rawTask !== content) {
      await this.bus.call('session.addMessage', {
        sessionKey, content: rawTask, role: 'system',
        metadata: { type: 'media_transform', mediaType: media!.type },
      }).catch(err => log.error(`Failed to store media transform: ${err}`));
    }

    const directives = parseDirectives(rawTask);
    const task = directives.cleaned || rawTask;

    let result = await this.runAgent({
      sessionKey, task, channel, images,
      thinkingLevel: directives.thinkingLevel,
      verbose: directives.verbose,
    });

    if (result.success && result.thinkingOnly) {
      log.info(`thinking-only response for ${sessionKey} — re-prompting`);
      result = await this.runAgent({ sessionKey, task: 'Provide your response.', channel });
    }

    if (result.success) {
      await this.deliverToChannel(channel, userId, result);
    } else {
      const errMsg = result.error
        ? friendlyError(classifyError(result.error))
        : 'Something went wrong — please try again.';
      await this.bus.call('channel.send', { sessionKey: `${channel}:${userId}`, text: errMsg })
        .catch(err => log.error(`Failed to send error reply: ${err}`));
    }
  }

  private async preprocessMedia(
    media: MediaAttachment | undefined,
    content: string,
    channel: string,
    userId: string,
  ): Promise<string | null> {
    if (!media) return content;

    const mediaModelName = this.config.agent.media?.[media.type as 'audio' | 'image'];

    if (mediaModelName) {
      try {
        const profile = resolveModel(this.config, mediaModelName);
        const transformed = await transformMedia(media, { ...profile, apiKey: resolveApiKey(profile) });
        return media.type === 'audio'
          ? transformed
          : `[Image description: ${transformed}]\n\n${content}`;
      } catch (err) {
        const raw = toMessage(err);
        log.error(`media transform failed: ${sanitizeError(raw)}`);
        const userMsg = friendlyError(classifyError(raw));
        await this.bus.call('channel.send', {
          sessionKey: `${channel}:${userId}`,
          text: `${media.type} processing failed. ${userMsg}`,
        }).catch(e => log.error(`Failed to send transform error: ${e}`));
        return null;
      }
    }

    if (media.type !== 'image') {
      await this.bus.call('channel.send', {
        sessionKey: `${channel}:${userId}`,
        text: `${media.type === 'audio' ? 'Voice' : media.type.charAt(0).toUpperCase() + media.type.slice(1)} messages are not enabled. Ask the admin to set this up.`,
      }).catch(err => log.error(`Failed to send media error: ${err}`));
      return null;
    }

    return content;
  }

  // ── Cron / Webhook trigger handling ─────────────────────────────────────────

  async handleTriggeredRun(opts: {
    kind: 'cron' | 'webhook';
    triggerId: string;
    task: string;
    sessionKey: string;
    notify?: string[];
  }): Promise<void> {
    const { kind, triggerId, task, sessionKey, notify } = opts;
    const idKey = kind === 'cron' ? 'taskId' : 'hookId';

    await this.bus.call('session.create', {
      sessionKey,
      metadata: { [idKey]: triggerId, ...(notify?.length && { notify }) },
    }).catch((err: unknown) => {
      const msg = toMessage(err);
      if (!msg.includes('already exists')) log.error(`Failed to create ${kind} session: ${msg}`);
    });

    await this.bus.call('session.addMessage', {
      sessionKey, content: task, role: 'user',
      metadata: { source: kind, [idKey]: triggerId },
    }).catch(err => log.error(`Failed to store ${kind} task message: ${err}`));

    let result = await this.runAgent({ sessionKey, task });

    if (result.success && result.thinkingOnly) {
      log.info(`thinking-only response for ${kind}:${triggerId} — re-prompting`);
      result = await this.runAgent({ sessionKey, task: 'Provide your response. Summarize what you found or did.' });
    }

    // Prune HEARTBEAT_OK no-op exchanges
    if (result.success && result.response && stripHeartbeatToken(result.response) === null) {
      await this.bus.call('session.compact', { sessionKey, count: 2 })
        .catch(err => log.debug(`heartbeat prune: ${err}`));
      log.debug(`heartbeat pruned: ${triggerId}`);
      return;
    }

    if (!notify?.length) return;

    const prefix = sessionKey + ':subagent:';
    const hasSubagents = this.runtime.listActiveRuns().some(r => r.sessionKey?.startsWith(prefix));
    if (hasSubagents) {
      log.info(`${kind}:${triggerId} spawned sub-agents — deferring delivery`);
      return;
    }

    await this.deliverToNotifyTargets(notify, result);
  }

  // ── Subagent orchestration ───────────────────────────────────────────────────

  private async handleSubagentCompletion(childKey: string, result: PiAgentRunResult): Promise<void> {
    const session = await this.bus.call('session.get', { sessionKey: childKey }).catch(() => null);
    const parentKey = session?.metadata?.parentSessionKey as string | undefined;
    if (!parentKey) return;

    await this.announceToParent(childKey, parentKey, result);

    const existing = this.retriggerTimers.get(parentKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => this.triggerParentRun(parentKey), RETRIGGER_DEBOUNCE_MS);
    this.retriggerTimers.set(parentKey, timer);
  }

  private async announceToParent(childKey: string, parentKey: string, result: PiAgentRunResult): Promise<void> {
    const status = result.success ? 'success' : 'error';
    const summary = result.response?.slice(0, 500) ?? '(no response)';
    const durationStr = result.duration ? `${(result.duration / 1000).toFixed(1)}s` : 'unknown';

    await this.bus.call('session.addMessage', {
      sessionKey: parentKey,
      content: `[Subagent Complete] session=${childKey} status=${status} duration=${durationStr}\n\n${summary}`,
      role: 'system',
      metadata: { type: 'subagent_announce', childSessionKey: childKey, success: result.success },
    }).catch(err => log.error(`Failed to announce to parent: ${err}`));
  }

  private async triggerParentRun(parentKey: string): Promise<void> {
    this.retriggerTimers.delete(parentKey);
    log.info(`re-triggering parent ${parentKey} after sub-agent completions`);

    const fallback = 'Sub-agents completed. Review results above. If your original plan has remaining steps, continue executing them. Otherwise, synthesize a final response for the user.';
    let task = fallback;

    try {
      const messages = await this.bus.call('session.getMessages', { sessionKey: parentKey, limit: 50 });
      const lastUserMsg = [...(messages ?? [])].reverse().find(
        m => m.role === 'user' && !m.content.startsWith('[Subagent Complete]'),
      );
      if (lastUserMsg) {
        task = `Sub-agents completed. Your original task was:\n\n> ${lastUserMsg.content.slice(0, 500)}\n\n` +
          'Review all sub-agent results above. If your plan has remaining steps, continue executing them (spawn more sub-agents as needed). Otherwise, synthesize a final response for the user.';
      }
    } catch { /* use fallback */ }

    const parentResult = await this.runAgent({ sessionKey: parentKey, task, retrigger: true });
    await this.routeParentResult(parentKey, parentResult);
  }

  private async routeParentResult(parentKey: string, result: PiAgentRunResult): Promise<void> {
    if (this.runtime.listActiveRuns().some(r => r.sessionKey?.startsWith(parentKey + ':subagent:'))) {
      log.info(`parent ${parentKey} still has active subagents — deferring delivery`);
      return;
    }

    const rootKey = parentKey.split(':subagent:')[0];
    const isTriggered = rootKey.startsWith('cron:') || rootKey.startsWith('webhook:');

    if (isTriggered) {
      const rootSession = await this.bus.call('session.get', { sessionKey: rootKey }).catch(() => null);
      const notify = (rootSession?.metadata?.notify as string[]) ?? [];
      if (notify.length) await this.deliverToNotifyTargets(notify, result);
      return;
    }

    const target = parseTarget(rootKey);
    if (target) await this.deliverToChannel(target.channel, target.userId, result);
  }

  // ── Delivery helpers ─────────────────────────────────────────────────────────

  private async deliverToNotifyTargets(notify: string[], result: PiAgentRunResult): Promise<void> {
    for (const target of notify) {
      const parsed = parseTarget(target);
      if (!parsed) continue;

      if (result.success && result.response) {
        const cleaned = stripHeartbeatToken(result.response);
        if (cleaned) {
          await this.bus.call('session.addMessage', {
            sessionKey: target, content: cleaned, role: 'assistant',
          }).catch(err => log.error(`Failed to store notify message: ${err}`));
        }
      }

      await this.deliverToChannel(parsed.channel, parsed.userId, result);
    }
  }

  private async deliverToChannel(channel: string, userId: string, result: PiAgentRunResult): Promise<void> {
    if (!result.success || !result.response) return;
    const cleaned = stripHeartbeatToken(result.response);
    if (cleaned === null) return;
    await this.bus.call('channel.send', { sessionKey: `${channel}:${userId}`, text: cleaned })
      .catch(err => {
        log.error(`Failed to send reply: ${err}`);
        appendError({ message: toMessage(err), sessionKey: `${channel}:${userId}` }).catch(() => {});
      });
    log.info(`reply sent: ${channel}:${userId}`);
  }

  // ── Channel inbound subscription ─────────────────────────────────────────────

  @on('channel.onInbound')
  onChannelInbound(payload: EventMap['channel.onInbound']): void {
    this.handleChannelMessage(payload).catch(err => log.error(`channel inbound: ${err}`));
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const appConfig = await bus.call('config.get', {});
  const svc = new AgentService(bus, appConfig);
  bus.bootstrap(svc);
  return { stop: () => svc.stop() };
}
