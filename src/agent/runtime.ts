/**
 * Pi SDK integration for Vargos
 * Embeds pi-coding-agent with:
 * - Message queue for per-session serialization
 * - Lifecycle events for streaming
 * - Bootstrap file injection
 */

import {
  type AgentSession,
  type AgentSessionEvent,
  type CompactionResult,
  type SessionMessageEntry,
} from '@mariozechner/pi-coding-agent';
import { toolRegistry } from '../tools/registry.js';
import type { ToolResult } from '../tools/types.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('runtime');
import { buildSystemPrompt, resolvePromptMode } from './prompt.js';
import { AgentLifecycle, type AgentStreamEvent } from './lifecycle.js';
import { SessionMessageQueue } from './queue.js';
import type { ISessionService, SessionMessage } from '../sessions/types.js';
import { type CompactionConfig } from '../config/pi-config.js';
import { loadContextFiles } from '../config/workspace.js';
import { sanitizeHistory, limitHistoryTurns, getHistoryLimit, toAgentMessages } from './history.js';
import { getVargosToolNames } from './extension.js';
import { buildPiSession } from './session-setup.js';

export { PROVIDER_BASE_URLS, resolveProviderBaseUrl } from './session-setup.js';

/**
 * Extract plain text from Pi SDK content (string, array of content blocks, or object).
 * Skips thinking/reasoning blocks — only returns visible text.
 */
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

/**
 * Check if a Pi SDK content array contains only thinking/reasoning blocks
 * (no visible text, no tool calls). These should not be treated as errors.
 */
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
  contextFiles?: Array<{ name: string; content: string }>;
  extraSystemPrompt?: string;
  userTimezone?: string;
  runId?: string;
  images?: Array<{ data: string; mimeType: string }>;
  channel?: string;
  bootstrapOverrides?: Record<string, string>;
  compaction?: CompactionConfig;
}

export interface PiAgentRunResult {
  success: boolean;
  response?: string;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  duration?: number;
}

export interface RuntimeDeps {
  sessionService: ISessionService;
  lifecycle?: AgentLifecycle;
  queue?: SessionMessageQueue;
}

function tokenSummary(input: number, output: number) {
  return { input, output, total: input + output };
}

/**
 * Pi Agent Runtime
 * Manages Pi SDK agent sessions
 */
export class PiAgentRuntime {
  private lifecycle: AgentLifecycle;
  private messageQueue: SessionMessageQueue;
  private sessionService: ISessionService;

  constructor(deps: RuntimeDeps) {
    this.sessionService = deps.sessionService;
    this.lifecycle = deps.lifecycle ?? new AgentLifecycle();
    this.messageQueue = deps.queue ?? new SessionMessageQueue();
    this.messageQueue.on('execute', this.handleQueuedMessage.bind(this));
  }

  /**
   * Run an agent session
   * Queued per-session to prevent race conditions
   */
  async run(config: PiAgentConfig): Promise<PiAgentRunResult> {
    const runId = config.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    log.debug(`Queueing run: runId=${runId} session=${config.sessionKey} model=${config.model ?? 'default'}`);

    return this.messageQueue.enqueue<PiAgentRunResult>(
      config.sessionKey,
      '',
      'user',
      { config, runId }
    );
  }

  private async handleQueuedMessage(
    message: { sessionKey: string; metadata?: { config: PiAgentConfig; runId: string } },
    resolve: (value: PiAgentRunResult) => void,
    reject: (error: Error) => void
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
      log.debug(`Lifecycle started: runId=${runId}`);

      const { session, sessionManager } = await buildPiSession(config);

      await this.injectSystemPrompt(session, config);
      await this.injectHistory(session, config);

      this.subscribeToSessionEvents(session, config.sessionKey, runId);

      let task = config.task;
      if (!task) {
        const messages = await this.loadSessionMessages(config.sessionKey);
        const taskMessages = messages.filter((m) => m.metadata?.type === 'task');
        task = taskMessages[taskMessages.length - 1]?.content ?? 'Complete your assigned task.';
      }

      const piImages = config.images?.map(img => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.mimeType,
      }));
      log.info(`prompting agent: session=${config.sessionKey} prompt=${task.slice(0, 120)}...`);

      await this.promptWithRetry(session, sessionManager, task, piImages);

      log.info(`agent run complete: session=${config.sessionKey}`);

      return this.extractRunResult(sessionManager.getEntries(), startedAt, runId, config.sessionKey);
    } catch (err) {
      const duration = Date.now() - startedAt;
      const raw = err instanceof Error ? err.message : String(err);
      log.error(`Run ${runId} failed (${(duration / 1000).toFixed(1)}s): ${raw}`);
      this.lifecycle.errorRun(runId, raw);
      return { success: false, error: raw, duration };
    }
  }

  private async injectSystemPrompt(session: AgentSession, config: PiAgentConfig): Promise<void> {
    const contextFiles = config.contextFiles !== undefined
      ? config.contextFiles
      : await loadContextFiles(config.workspaceDir);
    const promptMode = resolvePromptMode(config.sessionKey);
    const systemPromptText = await buildSystemPrompt({
      mode: promptMode,
      workspaceDir: config.workspaceDir,
      toolNames: getVargosToolNames(),
      contextFiles,
      extraSystemPrompt: config.extraSystemPrompt,
      userTimezone: config.userTimezone,
      repoRoot: config.workspaceDir,
      model: config.model,
      channel: config.channel,
      bootstrapOverrides: config.bootstrapOverrides,
    });
    session.agent.setSystemPrompt(systemPromptText);
    log.debug(`system prompt: ${systemPromptText.length} chars, mode=${promptMode}`);
  }

  private async injectHistory(session: AgentSession, config: PiAgentConfig): Promise<void> {
    const storedMessages = await this.loadSessionMessages(config.sessionKey);
    if (storedMessages.length === 0) {
      log.debug('history: no stored messages');
      return;
    }
    const agentMessages = toAgentMessages(storedMessages);
    const sanitized = sanitizeHistory(agentMessages);
    const limited = limitHistoryTurns(sanitized, getHistoryLimit(config.sessionKey));
    log.debug(`history: ${storedMessages.length} stored → ${agentMessages.length} converted → ${sanitized.length} sanitized → ${limited.length} injected (limit=${getHistoryLimit(config.sessionKey)})`);
    session.agent.replaceMessages(limited);
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
        log.info(`retrying after transient API error (attempt ${attempt + 1}/${API_RETRY_LIMIT + 1})`);
        await session.prompt('Continue from where you left off.');
      }

      const entries = sessionManager.getEntries();
      const lastAssistantEntry = this.findLastAssistantMessage(entries);
      if (!lastAssistantEntry || lastAssistantEntry.stopReason !== 'error') {
        lastError = undefined;
        break;
      }

      lastError = lastAssistantEntry.errorMessage;

      // Only retry on JSON parse errors (transient API/provider issues)
      if (!lastError?.includes('after JSON') && !lastError?.includes('Unexpected')) break;

      if (attempt === API_RETRY_LIMIT) {
        log.error(`exhausted ${API_RETRY_LIMIT + 1} attempts: ${lastError}`);
      }
    }
  }

  private async extractRunResult(
    sessionEntries: Array<{ type: string }>,
    startedAt: number,
    runId: string,
    sessionKey: string,
  ): Promise<PiAgentRunResult> {
    log.debug(`session entries: ${sessionEntries.length} total`);
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
            if (msg.usage) log.error(`usage: in=${msg.usage.input} out=${msg.usage.output}`);
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
        log.info(`thinking-only response for ${sessionKey} — skipping delivery`);
        const duration = Date.now() - startedAt;
        this.lifecycle.endRun(runId, tokenSummary(inputTokens, outputTokens));
        return { success: true, duration };
      }

      const hint = 'Empty response — model returned nothing useful.';
      log.error(hint);
      return { success: false, error: hint, duration: Date.now() - startedAt };
    }

    await this.storeResponse(sessionKey, response).catch((e) =>
      log.error(`failed to store response for ${sessionKey}: ${e instanceof Error ? e.message : e}`),
    );

    const duration = Date.now() - startedAt;
    this.lifecycle.endRun(runId, tokenSummary(inputTokens, outputTokens));

    return {
      success: true,
      response,
      tokensUsed: tokenSummary(inputTokens, outputTokens),
      duration,
    };
  }

  private subscribeToSessionEvents(
    session: AgentSession,
    vargosSessionKey: string,
    runId: string
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
        this.lifecycle.streamTool(runId, 'tool', 'start', {});
        const tool = toolRegistry.get(event.toolName);
        const args = event.args as Record<string, unknown> | undefined;
        const summary = tool?.formatCall && args ? tool.formatCall(args) : '';
        log.info(`tool: ${event.toolName}(${summary})`);
      }

      if (event.type === 'tool_execution_end') {
        this.lifecycle.streamTool(runId, 'tool', 'end', {}, {});
        const toolName = (event as unknown as { toolName?: string }).toolName;
        const tool = toolName ? toolRegistry.get(toolName) : undefined;
        if (tool?.formatResult && event.result) {
          log.info(`tool end: ${tool.name} ${tool.formatResult(event.result as ToolResult)}`);
        } else if (event.result) {
          const content = Array.isArray(event.result.content)
            ? (event.result.content as Array<{ text?: string; data?: string }>).map(c => c.text || c.data || '').join('\n')
            : String(event.result);
          const preview = content.slice(0, 200);
          log.info(`tool end: ${preview}${content.length > 200 ? '...' : ''}`);
        }
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
    aborted: boolean
  ): Promise<void> {
    if (!result || aborted) return;

    this.lifecycle.streamCompaction(runId, result.tokensBefore, result.summary);

    const session = await this.sessionService.get(vargosSessionKey);
    if (!session) {
      log.error(`Session ${vargosSessionKey} not found, skipping compaction`);
      return;
    }

    const message = [
      `## Context Compacted`,
      ``,
      `**Tokens before:** ${result.tokensBefore}`,
      `**Summary:**`,
      result.summary.slice(0, 1000),
    ].join('\n');

    await this.sessionService.addMessage({
      sessionKey: vargosSessionKey,
      content: message,
      role: 'system',
      metadata: {
        type: 'compaction',
        tokensBefore: result.tokensBefore,
        firstKeptEntryId: result.firstKeptEntryId,
      },
    });
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

  private async loadSessionMessages(sessionKey: string): Promise<SessionMessage[]> {
    return this.sessionService.getMessages(sessionKey);
  }

  private async storeResponse(sessionKey: string, response: string): Promise<void> {
    await this.sessionService.addMessage({
      sessionKey,
      content: response,
      role: 'assistant',
      metadata: {},
    });
  }

  abortRun(runId: string, reason?: string): boolean {
    return this.lifecycle.abortRun(runId, reason);
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

  onLifecycle(callback: (phase: string, runId: string, data?: unknown) => void): void {
    this.lifecycle.on('start', (runId: string, sessionKey: string) => callback('start', runId, { sessionKey }));
    this.lifecycle.on('end', (runId: string, data: unknown) => callback('end', runId, data));
    this.lifecycle.on('run_error', (runId: string, error: Error) => callback('error', runId, { error }));
    this.lifecycle.on('abort', (runId: string, reason: string) => callback('abort', runId, { reason }));
  }
}
