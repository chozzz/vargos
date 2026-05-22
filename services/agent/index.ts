/**
 * Agent — PiAgent-powered runtime
 *
 * Features:
 * - PiAgent session persistence
 * - PiAgent ResourceLoader for skills/prompts
 * - Debug mode for inspecting tools, prompts, history
 * - Streaming events passthrough to bus (agent.onDelta, agent.onTool, agent.onCompleted)
 */

import { z } from 'zod';
import path from 'node:path';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, Json } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { parseDirectives } from './directives.js';
import { withTimeout } from '../../lib/timeout.js';
import { interpolatePrompt } from './prompt-interpolate.js';
import { truncate } from '../../lib/truncate.js';
import type { AgentDeps } from './schema.js';
import { existsSync, promises as fs } from 'node:fs';
import { getDataPaths } from '../../lib/paths.js';
import { parseSessionKey, isSubagentSession } from '../../lib/subagent.js';

// Pi SDK imports
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  type AgentSession,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent';

// PiAgent event types for type-safe event mapping
import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';

import { createCustomTools } from './tools.js';
import { loadChannelPersona, loadSubagentPersona } from './persona.js';
import { resolveSkillPaths } from '../../lib/skills.js';
import { matchesGlob } from '../../lib/glob.js';

const log = createLogger('agent');

// Hardcoded agent execution constants
const EXECUTION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ── AgentService ─────────────────────────────────────────────────────────────

export class AgentService {
  protected bus: Bus;
  protected config: AppConfig;
  protected sessions = new Map<string, AgentSession>();
  private activeRuns = new Set<string>();

  protected agentDir: string;
  protected authStorage: AuthStorage;
  protected modelRegistry: ModelRegistry;
  protected settings: SettingsManager;

  constructor(deps: AgentDeps) {
    this.bus = deps.bus;
    this.config = deps.config;

    const paths = getDataPaths();
    this.agentDir = path.join(paths.dataDir, 'agent');

    // Use ~/.vargos/agent for auth and models (override PiAgent defaults)
    const authJsonPath = path.join(this.agentDir, 'auth.json');
    const modelsJsonPath = path.join(this.agentDir, 'models.json');

    this.authStorage = AuthStorage.create(authJsonPath);
    this.modelRegistry = ModelRegistry.create(this.authStorage, modelsJsonPath);

    // Report model loading errors instead of silently falling back
    const modelError = this.modelRegistry.getError();
    if (modelError) {
      throw new Error(`Failed to load models from ${modelsJsonPath}: ${modelError}`);
    }

    this.settings = SettingsManager.create(paths.dataDir, this.agentDir);
    // NOTE: SettingsManager loads ~/.vargos/agent/models.json which has the
    // authoritative provider + model definitions. Pi Agent is the source of truth.

    // Apply retry settings for transient error recovery
    this.settings.applyOverrides({
      retry: {
        enabled: true,
        maxRetries: 3,
        baseDelayMs: 1000,
        provider: {
          timeoutMs: 120000, // 2 min per API call
          maxRetries: 3,
          maxRetryDelayMs: 30000, // exponential backoff up to 30s
        },
      },
    });
  }

  /**
   * Persist retry settings to disk during boot
   */
  async start() {
    try {
      const settingsPath = path.join(this.agentDir, 'settings.json');
      const currentData = await fs.readFile(settingsPath, 'utf-8');
      const currentSettings = JSON.parse(currentData);
      const updated = {
        ...currentSettings,
        retry: {
          enabled: true,
          maxRetries: 3,
          baseDelayMs: 1000,
          provider: {
            timeoutMs: 120000,
            maxRetries: 3,
            maxRetryDelayMs: 30000,
          },
        },
      };
      await fs.writeFile(settingsPath, JSON.stringify(updated, null, 2), 'utf-8');
      log.debug('Agent retry settings persisted to settings.json');
    } catch (err) {
      log.warn(`Failed to persist retry settings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * agent.execute — Run a task
   *
   * Note: sessionKey is declared optional here because it's auto-injected by
   * wrapEventAsToolDefinition() when the agent calls this as a tool. Direct callers
   * (channels, cron, webhooks, TCP) still provide sessionKey via EventMap.
   * 
   * Schema for bus event is different than runtime types AgentExecuteParams.
   * e.g. metadata is not injected here on purpose.
   */
  @register('agent.execute', {
    description: 'Executes a task with the agent, optionally delegating to a subagent.',
    schema: z.object({
      /**
       * `sessionKey` is intentionally not registered as schema here because when agent.execute is called as a tool from within an agent session, the `sessionKey` is auto-injected by wrapEventAsToolDefinition(). For direct calls from channels, cron, webhooks, TCP, the `sessionKey` is provided in the EventMap and is required for execution.
       * @see wrapEventAsToolDefinition in tools.ts for how `sessionKey` is injected when called as a tool.
       */
      task: z.string().describe('The task to execute.'),
      metadata: z.object({
        cwd: z.string().optional().describe('The current working directory to use for the agent.'),
        model: z.string().optional().describe('Model override in format provider:modelId.'),
        /**
         * Not all metadata fields need to be registered into MCP schemas, since they're primarily for internal use.
         * If one needs to see what else is in metadata, @see AgentExecuteParams in schema.ts and the debug metadata.json file stored in session's debug directory.
         */
      }).optional().describe('Optional metadata for the execution context.'),
    }).passthrough(),
  })
  async execute(params: EventMap['agent.execute']['params']): Promise<EventMap['agent.execute']['result']> {
    if (!params.sessionKey) {
      throw new Error('sessionKey is required for agent.execute');
    }

    log.debug(`execute: START ${params.sessionKey}`);
    const metadata = params.metadata ?? {};

    if (metadata?.model) {
      this.validateModel(metadata.model);
    }

    const directives = parseDirectives(params.task);
    const task = interpolatePrompt(directives.cleaned || params.task);

    const session = await this.getOrCreateSession(params.sessionKey, params.metadata);

    if (directives.thinkingLevel) {
      session.setThinkingLevel(directives.thinkingLevel);
    }

    this.activeRuns.add(params.sessionKey);
    const startTime = Date.now();
    const modelTag = `${session.model?.provider}:${session.model?.id}`;
    try {
      await withTimeout(session.prompt(task, { streamingBehavior: 'steer' }), EXECUTION_TIMEOUT_MS, `Agent execution timeout after ${EXECUTION_TIMEOUT_MS}ms`);
    } finally {
      this.activeRuns.delete(params.sessionKey);
    }

    const { content, error } = this.extractFinalAssistant(session);
    if (error) {
      log.error(`execute: ${params.sessionKey} ended with error: ${error}`);
      throw new Error(error);
    }
    const elapsed = Date.now() - startTime;
    log.info(`${params.sessionKey} → ${content.length} chars in ${elapsed}ms (${modelTag})`);
    return { response: content };
  }

  /**
   * agent.appendMessage — Append message to session JSONL without executing agent.
   * Used for non-whitelisted messages (skipAgent=true) to record in history silently.
   * Internal only — not exposed as an agent tool.
   */
  @register('agent.appendMessage')
  async appendMessage(params: EventMap['agent.appendMessage']['params']): Promise<void> {
    const session = await this.getOrCreateSession(params.sessionKey, params.metadata);
    const sessionFile = session.sessionManager.getSessionFile();

    if (!sessionFile) {
      log.debug(`No session file for ${params.sessionKey}, skipping append`);
      return;
    }

    log.debug(`Appending message to session ${params.sessionKey} (no execution)`);

    session.sessionManager.appendMessage({
      timestamp: Date.now(),
      role: 'user',
      content: params.content,
    });
    session.exportToJsonl(sessionFile);
  }

  /**
   * agent.status — Return currently active agent session keys.
   */
  @register('agent.status', {
    description: 'Return currently active agent session keys.',
    schema: z.object({ sessionKey: z.string().optional() }),
  })
  async status(_params: EventMap['agent.status']['params']): Promise<EventMap['agent.status']['result']> {
    return { activeRuns: Array.from(this.activeRuns) };
  }

  /**
   * Get or create AgentSession for sessionKey.
   */
  protected async getOrCreateSession(sessionKey: string, metadata?: EventMap['agent.execute']['params']['metadata']): Promise<AgentSession> {
    const cached = this.sessions.get(sessionKey);
    if (cached) {
      return cached;
    }

    const paths = getDataPaths();

    const effectiveCwd = metadata?.cwd ?? paths.dataDir;

    const sessionDir = path.join(paths.sessionsDir, sessionKey.replace(/:/g, path.sep));
    const sessionManager = SessionManager.create(effectiveCwd, sessionDir);

    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(this.agentDir, { recursive: true });

    const persona = await this.loadPersonaIfChannel(sessionKey);
    const customTools = await this.getCustomTools(sessionKey, persona?.meta.allowedTools);
    const rawSystemPrompt = await this.getSystemPrompt(sessionKey, metadata, persona?.body);
    const resourceLoader = await this.createResourceLoader(rawSystemPrompt, effectiveCwd);

    log.debug(`session: ${sessionKey} created (${customTools.length} tools, ${rawSystemPrompt?.length ?? 0} chars prompt)`);

    const { session } = await createAgentSession({
      cwd: effectiveCwd,
      agentDir: this.agentDir,
      sessionManager,
      settingsManager: this.settings,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      customTools,
      resourceLoader,
    });

    if (process.env.LOG_LEVEL === 'debug') {
      const debugDir = path.join(sessionDir, '.debug');
      if (!existsSync(debugDir)) {
        await fs.mkdir(debugDir, { recursive: true });
      }

      log.debug(`Storing debug files in session's debug directory: ${debugDir}`);
      await Promise.all([
        fs.writeFile(path.join(debugDir, `systemPrompt.md`), session.systemPrompt ?? '', 'utf-8'),
        fs.writeFile(path.join(debugDir, `metadata.json`), JSON.stringify(metadata ?? {}, null, 2), 'utf-8'),
      ]);
    }

    this.subscribeToSessionEvents(session, sessionKey);

    this.sessions.set(sessionKey, session);
    return session;
  }

  /**
   * Subscribe to PiAgent sessionsubscription - emit to bus for streaming + debug logging.
   */
  protected subscribeToSessionEvents(session: AgentSession, sessionKey: string, _metadata?: EventMap['agent.execute']['params']['metadata']): void {
    session.subscribe((event: AgentSessionEvent) => {
      const eventType = event.type;

      // log.debug(` --- :: Agent Lifecycle = ${eventType} --- :: ${sessionKey} --- ::  `);

      // Skip session-specific events (auto_retry_start, auto_retry_end) - not emitted as bus events
      if (eventType === 'auto_retry_start' || eventType === 'auto_retry_end') {
        return;
      }

      // Map PiAgent events to our bus events
      // Bridge PiAgent's untyped event structure to our typed EventMap

      switch (eventType) {
        case 'tool_execution_start': {
          const e = event as { toolName?: string; args?: unknown };
          if (e.toolName) {
            this.bus.emit('agent.onTool', {
              sessionKey,
              toolName: e.toolName,
              phase: 'start',
              args: (e.args ?? {}) as Json,
            });
          }
          break;
        }
        case 'tool_execution_end': {
          const e = event as { toolName?: string; result?: unknown };
          if (e.toolName) {
            this.bus.emit('agent.onTool', {
              sessionKey,
              toolName: e.toolName,
              phase: 'end',
              result: (e.result ?? {}) as Json,
            });
          }
          break;
        }
        case 'message_update': {
          const e = event as { delta?: string; text?: string };
          const delta = e.delta || e.text || '';
          if (delta) {
            this.bus.emit('agent.onDelta', { sessionKey, chunk: delta });
          }
          break;
        }
        case 'turn_end': {
          break;
        }
        case 'agent_end': {
          const { content, error } = this.extractFinalAssistant(session);
          if (error) {
            log.error(`agent_end with error for ${sessionKey}: ${error}`);
            this.bus.emit('agent.onCompleted', { sessionKey, success: false, error });
          } else {
            log.debug(`  emitting agent.onCompleted with ${content.length} chars`);
            this.bus.emit('agent.onCompleted', { sessionKey, success: true, response: content });
          }
          break;
        }
        default: {
          break;
        }
      }
    });
  }

  /**
   * Create ResourceLoader. PiAgent's DefaultResourceLoader handles skills, themes, and
   * prompt templates. We override systemPrompt with our Vargos bootstrap files.
   */
  protected async createResourceLoader(systemPromptOverride?: string, cwd?: string): Promise<DefaultResourceLoader> {
    const paths = getDataPaths();
    const effectiveCwd = cwd ?? paths.workspaceDir;
    // Only workspace + cwd here — Pi SDK already auto-loads <agentDir>/skills and <cwd>/.pi/skills.
    const skillPaths = resolveSkillPaths(paths.workspaceDir, ...(cwd ? [cwd] : []));

    const resourceLoader = new DefaultResourceLoader({
      cwd: effectiveCwd,
      agentDir: this.agentDir,
      settingsManager: this.settings,
      extensionFactories: [],
      additionalSkillPaths: skillPaths,
      noSkills: false,
      ...(systemPromptOverride && { systemPrompt: systemPromptOverride }),
    });

    await resourceLoader.reload();
    const { skills } = resourceLoader.getSkills();
    log.debug(`Resource loader loaded with ${skills.length} skills.`);
    return resourceLoader;
  }

  /**
   * Load persona for the given sessionKey.
   * - Subagent sessions: load `agents/subagent.md` (preamble + allowedTools whitelist).
   * - Channel sessions: load `agents/<channelId>.md` (persona + tool filter).
   * - Cron / CLI / other types: return null (no persona override applied).
   */
  private async loadPersonaIfChannel(sessionKey: string) {
    if (isSubagentSession(sessionKey)) return loadSubagentPersona();
    const { type } = parseSessionKey(sessionKey);
    const isChannel = this.config.channels.some(c => c.id === type);
    if (!isChannel) return null;
    return loadChannelPersona(type);
  }

  /**
   * Build system prompt.
   * - Subagent sessions: return the persona body from `agents/subagent.md`.
   *   No bootstrap files (AGENTS.md, SOUL.md, TOOLS.md) are loaded — the parent's
   *   task description is the subagent's sole context.
   * - Parent/other sessions: merge AGENTS.md + SOUL.md + TOOLS.md from workspace/cwd,
   *   then append channel persona body if provided.
   */
  private async getSystemPrompt(sessionKey: string, metadata?: EventMap['agent.execute']['params']['metadata'], personaBody?: string): Promise<string | undefined> {
    if (isSubagentSession(sessionKey)) {
      return personaBody?.trim() || undefined;
    }

    const bootstrapFiles = ['AGENTS.md', 'SOUL.md', 'TOOLS.md'];
    const maxCharsPerFile = 6000;

    const dirs = this.collectBootstrapDirs(metadata);

    const filePathsToLoad: Array<{ dir: string; filename: string; path: string }> = [];
    for (const dir of dirs) {
      for (const filename of bootstrapFiles) {
        filePathsToLoad.push({ dir, filename, path: path.join(dir, filename) });
      }
    }

    const fileContents = await Promise.all(
      filePathsToLoad.map(async (item) => {
        try {
          const content = await fs.readFile(item.path, 'utf-8');
          const truncated = truncate(content, maxCharsPerFile);
          log.debug(`Loaded ${item.dir}/${item.filename}: ${truncated.length} chars`);
          return {
            label: `<!-- ${item.dir}/${item.filename} -->`,
            content: truncated.trim(),
          };
        } catch {
          log.debug(`${item.dir}/${item.filename}: not found`);
          return null;
        }
      }),
    );

    const sections: string[] = [];
    for (const result of fileContents) {
      if (result) sections.push(result.label, result.content, '');
    }

    // Also log bootstrap files loaded
    log.debug(`session: ${sessionKey} bootstrap ${sections.filter(s => s.startsWith('<!--')).length} files, ${sections.join('\n').length} chars`);
    if (personaBody) {
      sections.push('<!-- channel persona -->', '<channel-persona>', personaBody.trim(), '</channel-persona>');
    }

    if (sections.length === 0) {
      log.debug('No bootstrap files found, using PiAgent default');
      return undefined;
    }

    const prompt = sections.join('\n');
    const context = this.buildPromptContext(sessionKey, metadata);
    return interpolatePrompt(prompt, context);
  }

  /**
   * Load custom tools from bus callable events. When `allowedPatterns` is provided
   * (from a channel persona), filter the tool list down to names matching at least
   * one glob pattern. Empty/undefined patterns = all tools allowed.
   */
  protected async getCustomTools(sessionKey: string, allowedPatterns?: string[]): Promise<ToolDefinition[]> {
    const tools = await createCustomTools(sessionKey, this.bus);
    if (!allowedPatterns?.length) return tools;
    // Match on `label` (original event name with dots, e.g. "memory.search")
    // rather than `name` (sanitized with dashes, e.g. "memory-search"),
    // so that frontmatter patterns like "memory.*" work as expected.
    return tools.filter(t => allowedPatterns.some(p => matchesGlob(p, t.label)));
  }

  /**
   * Validate model override if provided.
   */
  private validateModel(modelSpec: string): void {
    const [provider, modelId] = modelSpec.split(':');
    const model = this.modelRegistry.find(provider, modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelSpec}. Expected format: provider:modelId`);
    }
  }

  /**
   * Build context variables for prompt interpolation from sessionKey and metadata.
   */
  private buildPromptContext(
    sessionKey: string,
    metadata?: EventMap['agent.execute']['params']['metadata'],
  ): Record<string, string> {
    const { type: channelId, id: chatId } = parseSessionKey(sessionKey);
    return {
      SESSION_KEY: sessionKey,
      CHANNEL_ID: channelId,
      CHAT_ID: chatId,
      ...(metadata?.channelType && { CHANNEL_TYPE: metadata.channelType }),
      ...(metadata?.fromUserId && { USER_ID: metadata.fromUserId }),
      ...(metadata?.fromUser && { USER_NAME: metadata.fromUser }),
      ...(metadata?.fromUserHandle && { USER_HANDLE: metadata.fromUserHandle }),
      ...(metadata?.botUserId && { BOT_ID: metadata.botUserId }),
      ...(metadata?.botName && { BOT_NAME: metadata.botName }),
      ...(metadata?.botHandle && { BOT_HANDLE: metadata.botHandle }),
    };
  }

  /**
   * Collect directory paths in order: workspace first, then cwd if different.
   */
  private collectBootstrapDirs(metadata?: EventMap['agent.execute']['params']['metadata']): string[] {
    const paths = getDataPaths();
    const workspaceDir = paths.workspaceDir;
    const dirs = [workspaceDir];

    if (metadata?.cwd && path.resolve(metadata.cwd) !== path.resolve(workspaceDir)) {
      dirs.push(metadata.cwd);
    }

    // Filter dirs that do not exist
    return dirs.filter(dir => existsSync(dir));
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Extract the final assistant message: text content + error (when stopReason === 'error').
   * Pi SDK records inference failures (e.g. missing API key) as assistant messages with
   * empty content and `errorMessage` populated, instead of throwing — without inspecting
   * `stopReason`/`errorMessage` here, those would surface as silent empty completions.
   */
  private extractFinalAssistant(session: AgentSession): { content: string; error?: string } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = (session as any).state?.messages || [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role !== 'assistant') continue;

      const error = msg.stopReason === 'error'
        ? (msg.errorMessage ?? 'unknown inference error')
        : undefined;

      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((block: any) => block.type === 'text')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((block: any) => block.text || '')
          .filter(Boolean)
          .join('\n');
      }

      return error ? { content, error } : { content };
    }

    return { content: '' };
  }

  stop(): void {
    this.sessions.forEach((_session) => {
      _session.dispose();
    });
    this.sessions.clear();
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): void }> {
  const config = await bus.call('config.get', {});
  const runtime = new AgentService({ bus, config });
  bus.bootstrap(runtime);
  await runtime.start(); // Persist retry settings
  return { stop: () => runtime.stop() };
}
