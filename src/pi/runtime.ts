/**
 * Pi SDK integration for Vargos
 * Embeds pi-coding-agent with OpenClaw-style features:
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
  createCodingTools,
  type AgentSession,
  type AgentSessionEvent,
  type CompactionResult,
} from '@mariozechner/pi-coding-agent';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildSystemPrompt, resolvePromptMode } from '../agent/prompt.js';
import { getSessionService } from '../services/factory.js';
import { getAgentLifecycle, type AgentStreamEvent } from '../agent/lifecycle.js';
import { getSessionMessageQueue } from '../agent/queue.js';

export interface PiAgentConfig {
  sessionKey: string;
  sessionFile: string;
  workspaceDir: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  contextFiles?: Array<{ name: string; content: string }>;
  extraSystemPrompt?: string;
  userTimezone?: string;
  runId?: string;
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

/**
 * Pi Agent Runtime
 * Manages Pi SDK agent sessions with OpenClaw-style features
 */
export class PiAgentRuntime {
  private lifecycle = getAgentLifecycle();
  private messageQueue = getSessionMessageQueue();

  constructor() {
    // Set up message queue handler
    this.messageQueue.on('execute', this.handleQueuedMessage.bind(this));
  }

  /**
   * Run an agent session
   * Queued per-session to prevent race conditions
   */
  async run(config: PiAgentConfig): Promise<PiAgentRunResult> {
    const runId = config.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

    try {
      // Start lifecycle
      this.lifecycle.startRun(runId, config.sessionKey);

      // Ensure directories exist
      await fs.mkdir(path.dirname(config.sessionFile), { recursive: true });
      await fs.mkdir(path.join(config.workspaceDir, '.vargos', 'agent'), { recursive: true });

      // Build system prompt with bootstrap injection
      // Use Pi SDK tool names (not Vargos MCP tool names) since we're using Pi SDK's createCodingTools
      // Pi SDK tools: read, bash, edit, write, grep, find, ls
      const piToolNames = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'];
      
      const promptMode = resolvePromptMode(config.sessionKey);
      const systemContext = await buildSystemPrompt({
        mode: promptMode,
        workspaceDir: config.workspaceDir,
        toolNames: piToolNames,
        contextFiles: config.contextFiles,
        extraSystemPrompt: config.extraSystemPrompt,
        userTimezone: config.userTimezone,
        repoRoot: config.workspaceDir,
        model: config.model,
      });

      // Create Pi session manager
      const sessionManager = SessionManager.open(config.sessionFile);

      // Create auth storage for API keys
      const authStorage = new AuthStorage(
        path.join(config.workspaceDir, '.vargos', 'agent', 'auth.json')
      );

      // Set API key if provided
      if (config.apiKey && config.provider) {
        authStorage.setRuntimeApiKey(config.provider, config.apiKey);
      } else if (config.apiKey) {
        authStorage.setRuntimeApiKey('openai', config.apiKey);
      }

      // Create model registry
      const modelRegistry = new ModelRegistry(
        authStorage,
        path.join(config.workspaceDir, '.vargos', 'agent', 'models.json')
      );

      // Create settings manager
      const settings = SettingsManager.create(
        config.workspaceDir,
        path.join(config.workspaceDir, '.vargos', 'agent')
      );

      // Build model configuration
      let model = undefined;
      if (config.model) {
        const provider = config.provider ?? 'openai';
        model = modelRegistry.find(provider, config.model) ?? undefined;
      }

      // Create Pi SDK tools configured for the workspace
      const piTools = createCodingTools(config.workspaceDir);

      // Create agent session with tools
      const { session } = await createAgentSession({
        cwd: config.workspaceDir,
        agentDir: path.join(config.workspaceDir, '.vargos', 'agent'),
        sessionManager,
        settingsManager: settings,
        authStorage,
        modelRegistry,
        model,
        tools: piTools,
      });

      // Subscribe to Pi session events
      this.subscribeToSessionEvents(session, config.sessionKey, runId);

      // Get task from session messages
      const messages = await this.loadSessionMessages(config.sessionKey);
      const taskMessage = messages.find((m) => m.metadata?.type === 'task');
      const task = taskMessage?.content ?? 'Complete your assigned task.';

      // Prepend system context
      const prompt = `${systemContext}\n\n## Task\n\n${task}`;

      // Prompt the agent
      await session.prompt(prompt);

      // Get response from session history
      const sessionEntries = sessionManager.getEntries();
      let response = 'Task completed';
      let inputTokens = 0;
      let outputTokens = 0;

      for (let i = sessionEntries.length - 1; i >= 0; i--) {
        const entry = sessionEntries[i];
        if (entry.type === 'message') {
          const msg = (entry as { message?: { role?: string; content?: string } }).message;
          if (msg?.role === 'assistant' && msg?.content) {
            response = msg.content;
            break;
          }
        }
      }

      // Store completion in Vargos session
      await this.storeResponse(config.sessionKey, response);

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
      const message = err instanceof Error ? err.message : String(err);

      // Error lifecycle
      this.lifecycle.errorRun(runId, message);

      return {
        success: false,
        error: message,
        duration,
      };
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
      // Handle auto-compaction
      if (event.type === 'auto_compaction_end') {
        this.handleCompactionEvent(event.result, vargosSessionKey, runId, event.aborted);
      }

      // Handle tool execution events
      if (event.type === 'tool_execution_start') {
        // Tool started - Pi doesn't expose tool name directly in event
        this.lifecycle.streamTool(runId, 'tool', 'start', {});
      }
      if (event.type === 'tool_execution_end') {
        // Tool completed
        this.lifecycle.streamTool(runId, 'tool', 'end', {}, {});
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

    const sessions = getSessionService();

    // Check if session still exists
    const session = await sessions.get(vargosSessionKey);
    if (!session) {
      console.error(`[PiRuntime] Session ${vargosSessionKey} not found, skipping compaction`);
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
    const sessions = getSessionService();

    // Check parent exists
    const parentSession = await sessions.get(parentSessionKey);
    if (!parentSession) {
      console.error(`[PiRuntime] Parent ${parentSessionKey} not found, skipping announcement`);
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
   * Load messages from Vargos session
   */
  private async loadSessionMessages(
    sessionKey: string
  ): Promise<Array<{ content: string; role: string; metadata?: Record<string, unknown> }>> {
    const sessions = getSessionService();
    return sessions.getMessages(sessionKey);
  }

  /**
   * Store agent response
   */
  private async storeResponse(sessionKey: string, response: string): Promise<void> {
    const sessions = getSessionService();
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

  /**
   * Subscribe to specific events
   */
  onLifecycle(callback: (phase: string, runId: string, data?: unknown) => void): void {
    this.lifecycle.on('start', (runId: string, sessionKey: string) => callback('start', runId, { sessionKey }));
    this.lifecycle.on('end', (runId: string, data: unknown) => callback('end', runId, data));
    this.lifecycle.on('error', (runId: string, error: Error) => callback('error', runId, { error }));
    this.lifecycle.on('abort', (runId: string, reason: string) => callback('abort', runId, { reason }));
  }
}

// Global runtime instance
let globalRuntime: PiAgentRuntime | null = null;

export function getPiAgentRuntime(): PiAgentRuntime {
  if (!globalRuntime) {
    globalRuntime = new PiAgentRuntime();
  }
  return globalRuntime;
}

export function initializePiAgentRuntime(): PiAgentRuntime {
  globalRuntime = new PiAgentRuntime();
  return globalRuntime;
}
