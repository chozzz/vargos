/**
 * Pi SDK integration for Vargos
 * Embeds pi-coding-agent for actual agent execution
 * Hooks Pi's compaction events into Vargos sessions
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
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildSystemPrompt, resolvePromptMode } from '../agent/prompt.js';
import { getSessionService } from '../services/factory.js';

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
}

export interface PiAgentRunResult {
  success: boolean;
  response?: string;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Pi Agent Runtime
 * Manages Pi SDK agent sessions with Vargos integration
 * Hooks Pi's compaction events into Vargos sessions
 */
export class PiAgentRuntime {
  /**
   * Run an agent session
   */
  async run(config: PiAgentConfig): Promise<PiAgentRunResult> {
    try {
      // Ensure workspace exists
      await fs.mkdir(config.workspaceDir, { recursive: true });
      await fs.mkdir(path.join(config.workspaceDir, '.vargos', 'agent'), { recursive: true });

      // Build context for the agent
      const promptMode = resolvePromptMode(config.sessionKey);
      const systemContext = buildSystemPrompt({
        mode: promptMode,
        workspaceDir: config.workspaceDir,
        toolNames: [],
        contextFiles: config.contextFiles,
        extraSystemPrompt: config.extraSystemPrompt,
        userTimezone: config.userTimezone,
      });

      // Create Pi session manager
      const sessionManager = SessionManager.open(config.sessionFile);

      // Create auth storage for API keys
      const authStorage = new AuthStorage(
        path.join(config.workspaceDir, '.vargos', 'agent', 'auth.json')
      );

      // Set API key if provided in config
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

      // Build model configuration if specified
      let model = undefined;
      if (config.model) {
        const provider = config.provider ?? 'openai';
        model = modelRegistry.find(provider, config.model) ?? undefined;
      }

      // Create agent session
      const { session } = await createAgentSession({
        cwd: config.workspaceDir,
        agentDir: path.join(config.workspaceDir, '.vargos', 'agent'),
        sessionManager,
        settingsManager: settings,
        authStorage,
        modelRegistry,
        model,
      });

      // Subscribe to Pi session events (compaction, etc.)
      this.subscribeToSessionEvents(session, config.sessionKey);

      // Get task from session messages
      const messages = await this.loadSessionMessages(config.sessionKey);
      const taskMessage = messages.find((m) => m.metadata?.type === 'task');
      const task = taskMessage?.content ?? 'Complete your assigned task.';

      // Prepend system context to the task
      const prompt = `${systemContext}\n\n## Task\n\n${task}`;

      // Prompt the agent
      await session.prompt(prompt);

      // Get the response from session history
      const sessionEntries = sessionManager.getEntries();
      let response = 'Task completed';

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

      return {
        success: true,
        response,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Subscribe to Pi session events and sync to Vargos
   */
  private subscribeToSessionEvents(session: AgentSession, vargosSessionKey: string): void {
    session.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'auto_compaction_end') {
        this.handleCompactionEvent(event.result, vargosSessionKey, event.aborted);
      }
    });
  }

  /**
   * Handle Pi compaction event - sync to Vargos session
   */
  private async handleCompactionEvent(
    result: CompactionResult | undefined,
    vargosSessionKey: string,
    aborted: boolean
  ): Promise<void> {
    if (!result || aborted) return;

    const sessions = getSessionService();

    // Check if session still exists (may have been deleted)
    const session = await sessions.get(vargosSessionKey);
    if (!session) {
      console.error(`[PiRuntime] Session ${vargosSessionKey} not found, skipping compaction event`);
      return;
    }

    const message = [
      `## Context Compacted`,
      ``,
      `**Tokens before:** ${result.tokensBefore}`,
      `**First kept entry:** ${result.firstKeptEntryId.slice(0, 8)}...`,
      ``,
      `**Summary:**`,
      result.summary.slice(0, 1000),
      ``,
      `---`,
      `Prior conversation history was compacted to maintain context window.`,
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
   * Run a subagent and announce result back to parent
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
   * Announce subagent result to parent session
   */
  private async announceResult(
    parentSessionKey: string,
    childSessionKey: string,
    result: PiAgentRunResult
  ): Promise<void> {
    const sessions = getSessionService();

    // Check if parent session still exists
    const parentSession = await sessions.get(parentSessionKey);
    if (!parentSession) {
      console.error(`[PiRuntime] Parent session ${parentSessionKey} not found, skipping announcement`);
      return;
    }

    const status = result.success ? 'success' : 'error';
    const summary = result.success
      ? result.response ?? '(no response)'
      : result.error ?? '(unknown error)';

    const message = [
      `## Sub-agent Complete`,
      ``,
      `**Session:** ${childSessionKey}`,
      `**Status:** ${status}`,
      ``,
      `**Result:**`,
      summary.slice(0, 500),
      ``,
      `---`,
      `Use sessions_history to see full transcript.`,
    ].join('\n');

    await sessions.addMessage({
      sessionKey: parentSessionKey,
      content: message,
      role: 'system',
      metadata: { type: 'subagent_announce', childSessionKey },
    });
  }

  /**
   * Load messages from session service
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
  private async storeResponse(
    sessionKey: string,
    response: string
  ): Promise<void> {
    const sessions = getSessionService();
    await sessions.addMessage({
      sessionKey,
      content: response,
      role: 'assistant',
      metadata: {},
    });
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
