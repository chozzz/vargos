/**
 * Pi SDK integration for Vargos
 * Embeds pi-coding-agent with:
 * - Message queue for per-session serialization
 * - Lifecycle events for streaming
 * - Bootstrap file injection
 */

import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
  type CompactionResult,
  type SessionMessageEntry,
  type ExtensionFactory,
} from '@mariozechner/pi-coding-agent';
import { getVargosToolNames, createVargosCustomTools } from './extension.js';
import { toolRegistry } from '../tools/registry.js';
import type { ToolResult } from '../tools/types.js';
import { createLogger } from '../lib/logger.js';
import { promises as fs } from 'node:fs';

const log = createLogger('runtime');
import { buildSystemPrompt, resolvePromptMode } from './prompt.js';
import { AgentLifecycle, type AgentStreamEvent } from './lifecycle.js';
import { SessionMessageQueue } from './queue.js';
import type { ISessionService, SessionMessage } from '../sessions/types.js';
import { getPiConfigPaths, type CompactionConfig } from '../config/pi-config.js';
import { loadContextFiles } from '../config/workspace.js';
import { LOCAL_PROVIDERS } from '../config/validate.js';
import { sanitizeHistory, limitHistoryTurns, getHistoryLimit, toAgentMessages } from './history.js';
import { createContextPruningExtension } from './extensions/context-pruning.js';
import { createCompactionSafeguardExtension } from './extensions/compaction-safeguard.js';

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  perplexity: 'https://api.perplexity.ai',
};

function resolveProviderBaseUrl(provider: string, configBaseUrl?: string): string | undefined {
  if (configBaseUrl) {
    const raw = configBaseUrl.replace(/\/$/, '');
    return raw.endsWith('/v1') ? raw : raw + '/v1';
  }
  return PROVIDER_BASE_URLS[provider];
}

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

    // Queue this run for the session
    return this.messageQueue.enqueue<PiAgentRunResult>(
      config.sessionKey,
      '', // Content handled separately
      'user',
      { config, runId }
    );
  }

  /**
   * Handle a queued message
   * This runs serialized per-session
   */
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

  /**
   * Execute the actual run
   */
  private async executeRun(config: PiAgentConfig, runId: string): Promise<PiAgentRunResult> {
    const startedAt = Date.now();
    log.debug(`Executing run: runId=${runId} session=${config.sessionKey} provider=${config.provider ?? 'openai'}`);

    try {
      // Start lifecycle
      this.lifecycle.startRun(runId, config.sessionKey);
      log.debug(`Lifecycle started: runId=${runId}`);

      // Ensure directories exist
      const piPaths = getPiConfigPaths(config.workspaceDir);
      await fs.mkdir(piPaths.agentDir, { recursive: true });

      // In-memory session — no Pi SDK files, all persistence via FileSessionService
      const sessionManager = SessionManager.inMemory(config.workspaceDir);

      // Create auth storage for API keys
      const authStorage = new AuthStorage(piPaths.authPath);

      const provider = config.provider ?? 'openai';

      // Set API key — ollama/lmstudio need a dummy key for Pi SDK auth checks
      if (config.apiKey) {
        authStorage.setRuntimeApiKey(provider, config.apiKey);
      } else if (LOCAL_PROVIDERS.has(provider)) {
        authStorage.setRuntimeApiKey(provider, 'local');
      }

      // Create model registry
      const modelRegistry = new ModelRegistry(authStorage, piPaths.modelsPath);

      // Create settings manager
      const settings = SettingsManager.create(config.workspaceDir, piPaths.agentDir);

      // Build model configuration
      let model = undefined;
      if (config.model) {
        model = modelRegistry.find(provider, config.model) ?? undefined;

        // Register unknown models not in Pi SDK's built-in registry
        if (!model && config.model) {
          const baseUrl = resolveProviderBaseUrl(provider, config.baseUrl);
          const apiKey = config.apiKey ?? (LOCAL_PROVIDERS.has(provider) ? 'local' : undefined);

          if (baseUrl && apiKey) {
            const contextWindow = config.contextWindow ?? 128_000;
            const maxTokens = config.maxTokens ?? Math.min(16_384, contextWindow);
            log.info(`registering model: provider=${provider} model=${config.model} baseUrl=${baseUrl} maxTokens=${maxTokens}`);
            modelRegistry.registerProvider(provider, {
              baseUrl,
              apiKey,
              api: 'openai-completions',
              models: [{
                id: config.model,
                name: config.model,
                reasoning: false,
                input: ['text', 'image'] as ('text' | 'image')[],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow,
                maxTokens,
              }],
            });
            model = modelRegistry.find(provider, config.model) ?? undefined;
          }
        }
      }

      // Create Vargos custom tools for Pi SDK
      // These wrap Vargos MCP tools into Pi SDK's ToolDefinition format
      const vargosCustomTools = createVargosCustomTools(config.workspaceDir, config.sessionKey);
      log.debug(`Created ${vargosCustomTools.length} custom tools`);

      // Build compaction extension factories
      const extensionFactories: ExtensionFactory[] = [];
      const compactionCfg = config.compaction;

      if (compactionCfg?.contextPruning?.enabled !== false) {
        extensionFactories.push(createContextPruningExtension(compactionCfg?.contextPruning));
      }
      if (compactionCfg?.safeguard?.enabled !== false) {
        extensionFactories.push(createCompactionSafeguardExtension(compactionCfg?.safeguard));
      }

      // Resource loader with compaction extensions
      const resourceLoader = new DefaultResourceLoader({
        cwd: config.workspaceDir,
        agentDir: piPaths.agentDir,
        settingsManager: settings,
        extensionFactories,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
      });
      await resourceLoader.reload();

      // Create agent session with Vargos custom tools
      // We pass empty built-in tools and all Vargos tools as customTools
      log.debug(`Creating agent session: workspace=${config.workspaceDir}`);
      const { session } = await createAgentSession({
        cwd: config.workspaceDir,
        agentDir: piPaths.agentDir,
        sessionManager,
        settingsManager: settings,
        authStorage,
        modelRegistry,
        model,
        tools: [], // No built-in Pi SDK tools - we use Vargos tools instead
        customTools: vargosCustomTools, // All Vargos MCP tools
        resourceLoader,
      });

      // Build and inject system prompt every run (channels never hit storedMessages===0)
      const contextFiles = config.contextFiles !== undefined
        ? config.contextFiles
        : await loadContextFiles(config.workspaceDir);
      const vargosToolNames = getVargosToolNames();
      const promptMode = resolvePromptMode(config.sessionKey);
      const systemPromptText = await buildSystemPrompt({
        mode: promptMode,
        workspaceDir: config.workspaceDir,
        toolNames: vargosToolNames,
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

      // Load history from FileSessionService and inject into Pi SDK session
      const storedMessages = await this.loadSessionMessages(config.sessionKey);
      if (storedMessages.length > 0) {
        const agentMessages = toAgentMessages(storedMessages);
        const sanitized = sanitizeHistory(agentMessages);
        const limited = limitHistoryTurns(sanitized, getHistoryLimit(config.sessionKey));
        log.debug(`history: ${storedMessages.length} stored → ${agentMessages.length} converted → ${sanitized.length} sanitized → ${limited.length} injected (limit=${getHistoryLimit(config.sessionKey)})`);
        session.agent.replaceMessages(limited);
      } else {
        log.debug('history: no stored messages');
      }

      // Subscribe to Pi session events
      this.subscribeToSessionEvents(session, config.sessionKey, runId);

      // Task comes from the caller; fall back to session messages for legacy flows
      let task = config.task;
      if (!task) {
        const messages = await this.loadSessionMessages(config.sessionKey);
        const taskMessages = messages.filter((m) => m.metadata?.type === 'task');
        task = taskMessages[taskMessages.length - 1]?.content ?? 'Complete your assigned task.';
      }
      const prompt = task;

      // Prompt the agent (with optional vision images)
      const piImages = config.images?.map(img => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.mimeType,
      }));
      log.info(`prompting agent: session=${config.sessionKey} prompt=${prompt.slice(0, 120)}...`);

      // Prompt with retry on transient API parse errors
      const API_RETRY_LIMIT = 2;
      let lastError: string | undefined;
      for (let attempt = 0; attempt <= API_RETRY_LIMIT; attempt++) {
        if (attempt === 0) {
          await session.prompt(prompt, piImages?.length ? { images: piImages } : undefined);
        } else {
          log.info(`retrying after transient API error (attempt ${attempt + 1}/${API_RETRY_LIMIT + 1})`);
          await session.prompt('Continue from where you left off.');
        }

        // Check if the last assistant message is an error
        const entries = sessionManager.getEntries();
        const lastAssistantEntry = this.findLastAssistantMessage(entries);
        if (!lastAssistantEntry || lastAssistantEntry.stopReason !== 'error') {
          lastError = undefined;
          break; // Success or non-error — proceed
        }

        lastError = lastAssistantEntry.errorMessage;

        // Only retry on JSON parse errors (transient API/provider issues)
        if (!lastError?.includes('after JSON') && !lastError?.includes('Unexpected')) break;

        if (attempt === API_RETRY_LIMIT) {
          log.error(`exhausted ${API_RETRY_LIMIT + 1} attempts: ${lastError}`);
        }
      }

      log.info(`agent run complete: session=${config.sessionKey}`);

      // Get response from session history
      const sessionEntries = sessionManager.getEntries();
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
        // Thinking-only responses (model spent entire budget reasoning) — treat as success, skip delivery
        if (rawContent && isThinkingOnlyContent(rawContent)) {
          log.info(`thinking-only response for ${config.sessionKey} — skipping delivery`);
          const duration = Date.now() - startedAt;
          this.lifecycle.endRun(runId, { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens });
          return { success: true, duration };
        }

        const hint = 'Empty response — model returned nothing useful.';
        log.error(hint);
        return { success: false, error: hint, duration: Date.now() - startedAt };
      }

      // Store completion in Vargos session (non-fatal — response already streamed)
      await this.storeResponse(config.sessionKey, response).catch((e) =>
        log.error(`failed to store response for ${config.sessionKey}: ${e instanceof Error ? e.message : e}`),
      );

      // Calculate duration
      const duration = Date.now() - startedAt;

      // End lifecycle
      this.lifecycle.endRun(runId, {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      });

      return {
        success: true,
        response,
        tokensUsed: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        duration,
      };
    } catch (err) {
      const duration = Date.now() - startedAt;
      const raw = err instanceof Error ? err.message : String(err);
      log.error(`Run ${runId} failed (${(duration / 1000).toFixed(1)}s): ${raw}`);
      this.lifecycle.errorRun(runId, raw);
      return { success: false, error: raw, duration };
    }
  }

  /**
   * Subscribe to Pi session events
   */
  private subscribeToSessionEvents(
    session: AgentSession,
    vargosSessionKey: string,
    runId: string
  ): void {
    session.subscribe((event: AgentSessionEvent) => {
      // Stream assistant text deltas to lifecycle
      if (event.type === 'message_update') {
        const ame = event.assistantMessageEvent;
        if (ame?.type === 'text_delta') {
          this.lifecycle.streamAssistant(runId, ame.delta);
        }
      }

      // Handle auto-compaction
      if (event.type === 'auto_compaction_end') {
        this.handleCompactionEvent(event.result, vargosSessionKey, runId, event.aborted);
      }

      // Handle tool execution events
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

      // Log message completion — catches errors at the Pi SDK level
      if (event.type === 'message_end') {
        const msg = (event as unknown as { message?: { stopReason?: string; errorMessage?: string } }).message;
        if (msg?.stopReason === 'error') {
          log.error(`pi-sdk message error: ${msg.errorMessage ?? 'unknown'}`);
        }
      }
    });
  }

  /**
   * Handle Pi compaction event
   */
  private async handleCompactionEvent(
    result: CompactionResult | undefined,
    vargosSessionKey: string,
    runId: string,
    aborted: boolean
  ): Promise<void> {
    if (!result || aborted) return;

    // Stream compaction event
    this.lifecycle.streamCompaction(runId, result.tokensBefore, result.summary);

    const sessions = this.sessionService;

    // Check if session still exists
    const session = await sessions.get(vargosSessionKey);
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

    await sessions.addMessage({
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

  /**
   * Run a subagent and announce result back
   */
  async runSubagent(
    config: PiAgentConfig,
    parentSessionKey: string
  ): Promise<PiAgentRunResult> {
    const result = await this.run(config);
    await this.announceResult(parentSessionKey, config.sessionKey, result);
    return result;
  }

  /**
   * Announce subagent result to parent
   */
  private async announceResult(
    parentSessionKey: string,
    childSessionKey: string,
    result: PiAgentRunResult
  ): Promise<void> {
    const sessions = this.sessionService;

    // Check parent exists
    const parentSession = await sessions.get(parentSessionKey);
    if (!parentSession) {
      log.error(`Parent ${parentSessionKey} not found, skipping announcement`);
      return;
    }

    const status = result.success ? '✅ success' : '❌ error';
    const summary = result.success
      ? result.response?.slice(0, 500) ?? '(no response)'
      : result.error ?? '(unknown error)';

    const message = [
      `## Sub-agent Complete`,
      ``,
      `**Session:** ${childSessionKey}`,
      `**Status:** ${status}`,
      `**Duration:** ${result.duration ? `${(result.duration / 1000).toFixed(1)}s` : 'unknown'}`,
      ``,
      `**Result:**`,
      summary,
    ].join('\n');

    await sessions.addMessage({
      sessionKey: parentSessionKey,
      content: message,
      role: 'system',
      metadata: {
        type: 'subagent_announce',
        childSessionKey,
        success: result.success,
        duration: result.duration,
      },
    });
  }

  /**
   * Find the last assistant message in Pi SDK session entries
   */
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

  /**
   * Load messages from Vargos session
   */
  private async loadSessionMessages(sessionKey: string): Promise<SessionMessage[]> {
    return this.sessionService.getMessages(sessionKey);
  }

  /**
   * Store agent response
   */
  private async storeResponse(sessionKey: string, response: string): Promise<void> {
    const sessions = this.sessionService;
    await sessions.addMessage({
      sessionKey,
      content: response,
      role: 'assistant',
      metadata: {},
    });
  }

  /**
   * Abort a running session
   */
  abortRun(runId: string, reason?: string): boolean {
    return this.lifecycle.abortRun(runId, reason);
  }

  /**
   * List active runs
   */
  listActiveRuns(): Array<{ runId: string; sessionKey: string; duration: number }> {
    return this.lifecycle.listActiveRuns();
  }

  /**
   * Subscribe to stream events
   */
  onStream(callback: (event: AgentStreamEvent) => void): void {
    this.lifecycle.on('stream', callback);
  }

  offStream(callback: (event: AgentStreamEvent) => void): void {
    this.lifecycle.removeListener('stream', callback);
  }

  /**
   * Subscribe to specific events
   */
  onLifecycle(callback: (phase: string, runId: string, data?: unknown) => void): void {
    this.lifecycle.on('start', (runId: string, sessionKey: string) => callback('start', runId, { sessionKey }));
    this.lifecycle.on('end', (runId: string, data: unknown) => callback('end', runId, data));
    this.lifecycle.on('run_error', (runId: string, error: Error) => callback('error', runId, { error }));
    this.lifecycle.on('abort', (runId: string, reason: string) => callback('abort', runId, { reason }));
  }
}

