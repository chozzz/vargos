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
  type AgentSession,
  type AgentSessionEvent,
  type CompactionResult,
} from '@mariozechner/pi-coding-agent';
import { getVargosToolNames, createVargosCustomTools } from './extension.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildSystemPrompt, resolvePromptMode } from '../agent/prompt.js';
import { getSessionService } from '../services/factory.js';
import { getAgentLifecycle, type AgentStreamEvent } from '../agent/lifecycle.js';
import { getSessionMessageQueue } from '../agent/queue.js';
import { getPiConfigPaths } from '../config/pi-config.js';
import { loadContextFiles } from '../config/workspace.js';

/**
 * Extract plain text from Pi SDK content (string, array of content blocks, or object)
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block: { type?: string; text?: string }) =>
        block?.type === 'text' && block?.text ? block.text : '')
      .filter(Boolean)
      .join('\n');
  }
  // Fallback: try to get .text or stringify
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
  }
  return String(content);
}

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
  images?: Array<{ data: string; mimeType: string }>;
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

    // Auto-load context files from workspace when not provided
    const contextFiles = config.contextFiles?.length
      ? config.contextFiles
      : await loadContextFiles(config.workspaceDir);

    try {
      // Start lifecycle
      this.lifecycle.startRun(runId, config.sessionKey);

      // Ensure directories exist
      const piPaths = getPiConfigPaths(config.workspaceDir);
      await fs.mkdir(path.dirname(config.sessionFile), { recursive: true });
      await fs.mkdir(piPaths.agentDir, { recursive: true });

      // Build system prompt with bootstrap injection
      // Use all Vargos tools (Pi SDK + Vargos-specific)
      const vargosToolNames = getVargosToolNames();

      const promptMode = resolvePromptMode(config.sessionKey);
      const systemContext = await buildSystemPrompt({
        mode: promptMode,
        workspaceDir: config.workspaceDir,
        toolNames: vargosToolNames,
        contextFiles,
        extraSystemPrompt: config.extraSystemPrompt,
        userTimezone: config.userTimezone,
        repoRoot: config.workspaceDir,
        model: config.model,
      });

      // Create Pi session manager
      const sessionManager = SessionManager.open(config.sessionFile);

      // Create auth storage for API keys
      const authStorage = new AuthStorage(piPaths.authPath);

      // Set API key if provided
      if (config.apiKey && config.provider) {
        authStorage.setRuntimeApiKey(config.provider, config.apiKey);
      } else if (config.apiKey) {
        authStorage.setRuntimeApiKey('openai', config.apiKey);
      }

      // Create model registry
      const modelRegistry = new ModelRegistry(authStorage, piPaths.modelsPath);

      // Create settings manager
      const settings = SettingsManager.create(config.workspaceDir, piPaths.agentDir);

      // Build model configuration
      let model = undefined;
      if (config.model) {
        const provider = config.provider ?? 'openai';
        model = modelRegistry.find(provider, config.model) ?? undefined;
      }

      // Create Vargos custom tools for Pi SDK
      // These wrap Vargos MCP tools into Pi SDK's ToolDefinition format
      const vargosCustomTools = createVargosCustomTools(config.workspaceDir, config.sessionKey);

      // Create agent session with Vargos custom tools
      // We pass empty built-in tools and all Vargos tools as customTools
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
      });

      // Subscribe to Pi session events
      this.subscribeToSessionEvents(session, config.sessionKey, runId);

      // Get task from session messages (last task message wins for channel conversations)
      const messages = await this.loadSessionMessages(config.sessionKey);
      const taskMessages = messages.filter((m) => m.metadata?.type === 'task');
      const taskMessage = taskMessages[taskMessages.length - 1];
      const task = taskMessage?.content ?? 'Complete your assigned task.';

      // Prepend system context
      const prompt = `${systemContext}\n\n## Task\n\n${task}`;

      // Prompt the agent (with optional vision images)
      const piImages = config.images?.map(img => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.mimeType,
      }));
      await session.prompt(prompt, piImages?.length ? { images: piImages } : undefined);

      // Get response from session history
      const sessionEntries = sessionManager.getEntries();
      let response = 'Task completed';
      let inputTokens = 0;
      let outputTokens = 0;

      for (let i = sessionEntries.length - 1; i >= 0; i--) {
        const entry = sessionEntries[i];
        if (entry.type === 'message') {
          const msg = (entry as { message?: { role?: string; content?: unknown } }).message;
          if (msg?.role === 'assistant' && msg?.content) {
            response = extractTextContent(msg.content);
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
        console.error(`\n🔧 Tool: ${event.toolName || 'unknown'}`);
      }
      if (event.type === 'tool_execution_end') {
        // Tool completed - show result
        this.lifecycle.streamTool(runId, 'tool', 'end', {}, {});
        const result = event.result;
        if (result) {
          const content = Array.isArray(result.content) 
            ? result.content.map((c: any) => c.text || c.data || '').join('\n')
            : String(result);
          const preview = content.slice(0, 500);
          console.error(`Result: ${preview}${content.length > 500 ? '...' : ''}\n`);
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
