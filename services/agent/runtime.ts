/**
 * Pi Agent Runtime
 * Manages Pi SDK agent sessions with per-session serialization
 */

import {
  type AgentSession,
  type AgentSessionEvent,
  type CompactionResult,
  type SessionMessageEntry,
} from '@mariozechner/pi-coding-agent';
import type { Bus } from '../../gateway/bus.js';
import { isToolEvent } from '../../gateway/emitter.js';
import type { Json } from '../../gateway/events.js';
import { createLogger } from '../../lib/logger.js';
import { generateId } from '../../lib/id.js';
import { toMessage, classifyError, type ErrorClass } from '../../lib/error.js';
import { appendError } from '../../lib/error-store.js';
import { buildSystemPrompt, resolvePromptMode } from './prompt.js';
import { AgentLifecycle, type AgentStreamEvent } from './lifecycle.js';
import { SessionMessageQueue } from './queue.js';
import { sanitizeHistory, toAgentMessages, prepareHistory } from './history.js';
import { buildPiSession, type CompactionConfig } from './session-setup.js';

const log = createLogger('runtime');

const NON_RETRYABLE_CLASSES: Set<ErrorClass> = new Set(['auth', 'rate_limit', 'capability']);
const NON_RETRYABLE_PATTERNS = ['abort', 'cancelled', 'canceled'];

export function isRetryableError(message: string | undefined): boolean {
  if (!message) return false;
  if (NON_RETRYABLE_CLASSES.has(classifyError(message))) return false;
  const lower = message.toLowerCase();
  return !NON_RETRYABLE_PATTERNS.some(p => lower.includes(p));
}

export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block: { type?: string; text?: string }) =>
        block?.type === 'text' && block?.text ? block.text : '')
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
  }
  return String(content);
}

export function isThinkingOnlyContent(content: unknown): boolean {
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every((block: { type?: string; text?: string }) => {
    if (block?.type === 'thinking') return true;
    if (block?.type === 'text' && (!block.text || !block.text.trim())) return true;
    return false;
  });
}

export interface PiAgentConfig {
  sessionKey: string;
  workspaceDir: string;
  task?: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  contextWindow?: number;
  extraSystemPrompt?: string;
  userTimezone?: string;
  runId?: string;
  images?: Array<{ data: string; mimeType: string }>;
  channel?: string;
  bootstrapOverrides?: Record<string, string>;
  compaction?: CompactionConfig;
  thinkingLevel?: string;
  thinkingBudgets?: { minimal?: number; low?: number; medium?: number; high?: number };
  maxRetryDelayMs?: number;
  verbose?: boolean;
}

export interface PiAgentRunResult {
  success: boolean;
  response?: string;
  error?: string;
  tokensUsed?: { input: number; output: number; total: number };
  duration?: number;
  spawnedSubagents?: boolean;
  thinkingOnly?: boolean;
}

export interface RuntimeDeps {
  bus: Bus;
  lifecycle?: AgentLifecycle;
  queue?: SessionMessageQueue;
}

function tokenSummary(input: number, output: number) {
  return { input, output, total: input + output };
}

export class PiAgentRuntime {
  private lifecycle: AgentLifecycle;
  private messageQueue: SessionMessageQueue;
  private bus: Bus;

  constructor(deps: RuntimeDeps) {
    this.bus = deps.bus;
    this.lifecycle = deps.lifecycle ?? new AgentLifecycle();
    this.messageQueue = deps.queue ?? new SessionMessageQueue();
    this.messageQueue.on('execute', this.handleQueuedMessage.bind(this));
  }

  async run(config: PiAgentConfig): Promise<PiAgentRunResult> {
    const runId = config.runId || generateId('run');
    log.debug(`Queueing run: runId=${runId} session=${config.sessionKey} model=${config.model ?? 'default'}`);
    return this.messageQueue.enqueue<PiAgentRunResult>(config.sessionKey, '', 'user', { config, runId });
  }

  private async handleQueuedMessage(
    message: { sessionKey: string; metadata?: { config: PiAgentConfig; runId: string } },
    resolve: (value: PiAgentRunResult) => void,
    reject: (error: Error) => void,
  ): Promise<void> {
    const { config, runId } = message.metadata!;
    try {
      const result = await this.executeRun(config, runId);
      resolve(result);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async executeRun(config: PiAgentConfig, runId: string): Promise<PiAgentRunResult> {
    const startedAt = Date.now();
    log.debug(`Executing run: runId=${runId} session=${config.sessionKey} provider=${config.provider ?? 'openai'}`);

    try {
      this.lifecycle.startRun(runId, config.sessionKey);

      if (config.verbose) {
        config = {
          ...config,
          extraSystemPrompt: [
            config.extraSystemPrompt,
            'User requested verbose mode. Provide detailed, thorough responses.',
          ].filter(Boolean).join('\n\n'),
        };
      }

      const systemPromptText = await this.buildSystemPromptText(config);
      const { session, sessionManager } = await buildPiSession({
        ...config, systemPrompt: systemPromptText, bus: this.bus,
      });

      if (config.thinkingLevel) {
        session.agent.setThinkingLevel(config.thinkingLevel as Parameters<typeof session.agent.setThinkingLevel>[0]);
      }
      if (config.thinkingBudgets) {
        session.agent.thinkingBudgets = config.thinkingBudgets;
      }
      if (config.maxRetryDelayMs) {
        session.agent.maxRetryDelayMs = config.maxRetryDelayMs;
      }

      await this.injectHistory(session, config);

      const runToolCalls: Array<{ name: string; args?: unknown }> = [];
      this.subscribeToSessionEvents(session, config.sessionKey, runId, runToolCalls);

      let task = config.task;
      if (!task) {
        const messages = await this.bus.call('session.getMessages', { sessionKey: config.sessionKey });
        const taskMessages = messages.filter((m) => m.metadata?.type === 'task');
        task = taskMessages[taskMessages.length - 1]?.content ?? 'Complete your assigned task.';
      }

      const piImages = config.images?.map(img => ({
        type: 'image' as const, data: img.data, mimeType: img.mimeType,
      }));
      log.info(`prompting agent: session=${config.sessionKey} prompt=${task.slice(0, 120)}...`);

      await this.promptWithRetry(session, sessionManager, task, piImages);
      log.info(`agent run complete: session=${config.sessionKey}`);

      return this.extractRunResult(sessionManager.getEntries(), startedAt, runId, config, runToolCalls);
    } catch (err) {
      const duration = Date.now() - startedAt;
      const raw = toMessage(err);
      log.error(`Run ${runId} failed (${(duration / 1000).toFixed(1)}s): ${raw}`);
      this.lifecycle.errorRun(runId, raw);
      appendError({ runId, sessionKey: config.sessionKey, message: raw, model: config.model })
        .catch(e => log.error(`error store: ${e}`));
      return { success: false, error: raw, duration };
    }
  }

  private async buildSystemPromptText(config: PiAgentConfig): Promise<string> {
    const promptMode = resolvePromptMode(config.sessionKey);
    // Get tool names from bus metadata (only callable events with descriptions)
    const metadata = await this.bus.call('bus.search', {});
    const toolNames = metadata
      .filter(isToolEvent)
      .map(m => m.event);
    const text = await buildSystemPrompt({
      mode: promptMode,
      workspaceDir: config.workspaceDir,
      toolNames,
      extraSystemPrompt: config.extraSystemPrompt,
      userTimezone: config.userTimezone,
      repoRoot: config.workspaceDir,
      model: config.model,
      channel: config.channel,
      bootstrapOverrides: config.bootstrapOverrides,
      sessionKey: config.sessionKey,
    });
    log.debug(`system prompt: ${text.length} chars, mode=${promptMode}`);
    return text;
  }

  private async injectHistory(session: AgentSession, config: PiAgentConfig): Promise<void> {
    const storedMessages = await this.bus.call('session.getMessages', { sessionKey: config.sessionKey });
    if (storedMessages.length === 0) {
      log.debug('history: no stored messages');
      return;
    }
    const agentMessages = toAgentMessages(storedMessages);
    const sanitized = sanitizeHistory(agentMessages);
    const prepared = prepareHistory(sanitized, config.sessionKey, config.contextWindow);
    log.debug(`history: ${storedMessages.length} stored → ${agentMessages.length} converted → ${sanitized.length} sanitized → ${prepared.length} injected`);
    session.agent.replaceMessages(prepared);
  }

  private async promptWithRetry(
    session: AgentSession,
    sessionManager: import('@mariozechner/pi-coding-agent').SessionManager,
    prompt: string,
    piImages: Array<{ type: 'image'; data: string; mimeType: string }> | undefined,
  ): Promise<void> {
    const API_RETRY_LIMIT = 2;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= API_RETRY_LIMIT; attempt++) {
      if (attempt === 0) {
        await session.prompt(prompt, piImages?.length ? { images: piImages } : undefined);
      } else {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        log.info(`retrying after transient API error (attempt ${attempt + 1}/${API_RETRY_LIMIT + 1}, backoff ${delayMs}ms)`);
        await new Promise(r => setTimeout(r, delayMs));
        await session.prompt('Continue from where you left off.');
      }

      const entries = sessionManager.getEntries();
      const lastAssistant = this.findLastAssistantMessage(entries);
      if (!lastAssistant || lastAssistant.stopReason !== 'error') {
        lastError = undefined;
        break;
      }

      lastError = lastAssistant.errorMessage;
      if (!isRetryableError(lastError)) break;
      if (attempt === API_RETRY_LIMIT) log.error(`exhausted ${API_RETRY_LIMIT + 1} attempts: ${lastError}`);
    }
    void lastError;
  }

  private async extractRunResult(
    sessionEntries: Array<{ type: string }>,
    startedAt: number,
    runId: string,
    config: PiAgentConfig,
    runToolCalls: Array<{ name: string; args?: unknown }>,
  ): Promise<PiAgentRunResult> {
    const sessionKey = config.sessionKey;
    let response = '';
    let rawContent: unknown;
    let inputTokens = 0;
    let outputTokens = 0;

    for (let i = sessionEntries.length - 1; i >= 0; i--) {
      const entry = sessionEntries[i];
      if (entry.type === 'message') {
        const msg = (entry as SessionMessageEntry).message;
        if (msg?.role === 'assistant') {
          if (msg.stopReason === 'error' && msg.errorMessage) {
            log.error(`agent error: ${msg.errorMessage}`);
            this.lifecycle.errorRun(runId, msg.errorMessage);
            appendError({ runId, sessionKey, message: msg.errorMessage, model: config.model })
              .catch(e => log.error(`error store: ${e}`));
            return { success: false, error: msg.errorMessage, duration: Date.now() - startedAt };
          }
          if (msg.content) {
            rawContent = msg.content;
            response = extractTextContent(msg.content);
            if (msg.usage) {
              inputTokens = msg.usage.input ?? 0;
              outputTokens = msg.usage.output ?? 0;
            }
            break;
          }
        }
      }
    }

    if (!response.trim()) {
      if (rawContent && isThinkingOnlyContent(rawContent)) {
        log.info(`thinking-only response for ${sessionKey}`);
        const duration = Date.now() - startedAt;
        this.lifecycle.endRun(runId, tokenSummary(inputTokens, outputTokens));
        return { success: true, thinkingOnly: true, tokensUsed: tokenSummary(inputTokens, outputTokens), duration };
      }

      const hint = 'Empty response — model returned nothing useful.';
      log.error(hint);
      this.lifecycle.errorRun(runId, hint);
      return { success: false, error: hint, duration: Date.now() - startedAt };
    }

    const duration = Date.now() - startedAt;

    const meta = this.buildRunMetadata(sessionEntries, runId, config, inputTokens, outputTokens, runToolCalls);
    meta.duration = duration;

    await this.storeResponse(sessionKey, response, meta).catch((e) =>
      log.error(`failed to store response for ${sessionKey}: ${e instanceof Error ? e.message : e}`),
    );

    this.lifecycle.endRun(runId, tokenSummary(inputTokens, outputTokens));

    return {
      success: true,
      response,
      tokensUsed: tokenSummary(inputTokens, outputTokens),
      duration,
      ...(runToolCalls.some(tc => tc.name === 'agent.spawn') && { spawnedSubagents: true }),
    };
  }

  private buildRunMetadata(
    entries: Array<{ type: string }>,
    runId: string,
    config: PiAgentConfig,
    inputTokens: number,
    outputTokens: number,
    runToolCalls: Array<{ name: string; args?: unknown }>,
  ): Record<string, Json> {
    const thinkingBlocks: string[] = [];
    for (const entry of entries) {
      if (entry.type !== 'message') continue;
      const msg = (entry as SessionMessageEntry).message;
      if (msg?.role !== 'assistant') continue;
      const content = (msg as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content as Array<{ type?: string; thinking?: string }>) {
        if (block.type === 'thinking' && block.thinking) thinkingBlocks.push(block.thinking);
      }
    }

    const meta: Record<string, Json> = {
      runId,
      model: config.model ?? '',
      provider: config.provider ?? '',
      tokens: { input: inputTokens, output: outputTokens },
    };

    if (config.channel) meta.channel = config.channel;
    if (runToolCalls.length) meta.toolCalls = runToolCalls as Json[];
    if (thinkingBlocks.length) {
      const joined = thinkingBlocks.join('\n---\n');
      meta.thinking = joined.length > 4000 ? joined.slice(0, 4000) + '…' : joined;
    }

    return meta;
  }

  private subscribeToSessionEvents(
    session: AgentSession,
    vargosSessionKey: string,
    runId: string,
    runToolCalls?: Array<{ name: string; args?: unknown }>,
  ): void {
    session.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'message_update') {
        const ame = event.assistantMessageEvent;
        if (ame?.type === 'text_delta') {
          this.lifecycle.streamAssistant(runId, ame.delta);
        }
      }

      if (event.type === 'auto_compaction_end') {
        this.handleCompactionEvent(event.result, vargosSessionKey, runId, event.aborted);
      }

      if (event.type === 'tool_execution_start') {
        const args = event.args as Record<string, unknown> | undefined;
        this.lifecycle.streamTool(runId, event.toolName, 'start', args);
        log.info(`tool: ${event.toolName}`);
        runToolCalls?.push({ name: event.toolName, ...(args && { args }) });
      }

      if (event.type === 'tool_execution_end') {
        const toolName = (event as unknown as { toolName?: string }).toolName;
        let resultSummary: string | undefined;
        if (event.result) {
          const content = Array.isArray(event.result.content)
            ? (event.result.content as Array<{ text?: string; data?: string }>).map(c => c.text || c.data || '').join('\n')
            : String(event.result);
          resultSummary = content.slice(0, 200);
        }
        this.lifecycle.streamTool(runId, toolName ?? 'unknown', 'end', undefined, resultSummary);
      }

      if (event.type === 'message_end') {
        const msg = (event as unknown as { message?: { stopReason?: string; errorMessage?: string } }).message;
        if (msg?.stopReason === 'error') {
          log.error(`pi-sdk message error: ${msg.errorMessage ?? 'unknown'}`);
        }
      }
    });
  }

  private async handleCompactionEvent(
    result: CompactionResult | undefined,
    vargosSessionKey: string,
    runId: string,
    aborted: boolean,
  ): Promise<void> {
    if (!result || aborted) return;

    this.lifecycle.streamCompaction(runId, result.tokensBefore, result.summary);

    const message = [
      '## Context Compacted', '',
      `**Tokens before:** ${result.tokensBefore}`,
      '**Summary:**',
      result.summary.slice(0, 1000),
    ].join('\n');

    await this.bus.call('session.addMessage', {
      sessionKey: vargosSessionKey,
      content: message,
      role: 'system',
      metadata: {
        type: 'compaction',
        tokensBefore: result.tokensBefore,
        firstKeptEntryId: result.firstKeptEntryId,
      },
    }).catch(e => log.error(`compaction store: ${e}`));
  }

  private findLastAssistantMessage(
    entries: Array<{ type: string }>,
  ): { stopReason?: string; errorMessage?: string; content?: unknown } | null {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === 'message') {
        const msg = (entry as SessionMessageEntry).message;
        if (msg?.role === 'assistant') return msg;
      }
    }
    return null;
  }

  private async storeResponse(
    sessionKey: string,
    response: string,
    metadata?: Record<string, Json>,
  ): Promise<void> {
    await this.bus.call('session.addMessage', {
      sessionKey,
      content: response,
      role: 'assistant',
      ...(metadata && { metadata }),
    });
  }

  abortRun(runId: string, reason?: string): boolean {
    return this.lifecycle.abortRun(runId, reason);
  }

  abortSessionRuns(sessionKey: string, reason?: string): number {
    return this.lifecycle.abortSessionRuns(sessionKey, reason);
  }

  listActiveRuns(): Array<{ runId: string; sessionKey: string; duration: number }> {
    return this.lifecycle.listActiveRuns();
  }

  onStream(callback: (event: AgentStreamEvent) => void): void {
    this.lifecycle.on('stream', callback);
  }

  offStream(callback: (event: AgentStreamEvent) => void): void {
    this.lifecycle.removeListener('stream', callback);
  }
}
