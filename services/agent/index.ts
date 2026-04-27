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
import { parseFrontmatter } from '../../lib/frontmatter.js';
import { truncate } from '../../lib/truncate.js';
import type { AgentDeps } from './schema.js';
import { existsSync, promises as fs } from 'node:fs';
import { getDataPaths } from '../../lib/paths.js';
import { parseSessionKey } from '../../lib/subagent.js';

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

    this.settings = SettingsManager.create(paths.dataDir, this.agentDir);
    // NOTE: SettingsManager loads ~/.vargos/agent/models.json which has the
    // authoritative provider + model definitions. Pi Agent is the source of truth.
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
      task: z.string().describe('The task to execute.'),
      metadata: z.object({
        cwd: z.string().optional().describe('The current working directory to use for the agent.'),
        model: z.string().optional().describe('Model override in format provider:modelId.'),
        instructionsFile: z.string().optional().describe('Path to custom instructions .md file.'),
        channelType: z.string().optional().describe('Type of channel (e.g., telegram, whatsapp).'),
        fromUser: z.string().optional().describe('User display name.'),
        botName: z.string().optional().describe('Bot display name.'),
      }).optional().describe('Optional metadata for the execution context.'),
    }).passthrough(),
  })
  async execute(params: EventMap['agent.execute']['params']): Promise<EventMap['agent.execute']['result']> {
    if (!params.sessionKey) {
      throw new Error('sessionKey is required for agent.execute');
    }

    const metadata = params.metadata ?? {};

    // Validate model override if provided
    if (metadata?.model) {
      this.validateModel(metadata.model);
    }

    const directives = parseDirectives(params.task);
    const task = interpolatePrompt(directives.cleaned || params.task);

    const session = await this.getOrCreateSession(params.sessionKey, params.metadata);

    // Set thinking level from task directives if present
    if (directives.thinkingLevel) {
      session.setThinkingLevel(directives.thinkingLevel);
    }

    this.activeRuns.add(params.sessionKey);
    try {
      await withTimeout(session.prompt(task, { streamingBehavior: 'steer' }), EXECUTION_TIMEOUT_MS, `Agent execution timeout after ${EXECUTION_TIMEOUT_MS}ms`);
    } finally {
      this.activeRuns.delete(params.sessionKey);
    }

    const response = this.extractResponse(session);
    log.info(`Agent response length: ${response?.length ?? 0}`);
    return { response };
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
      content: params.task,
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
    if (cached) return cached;

    const paths = getDataPaths();

    const effectiveCwd = metadata?.cwd ?? paths.dataDir;

    const sessionDir = path.join(paths.sessionsDir, sessionKey.replace(/:/g, path.sep));
    const sessionManager = SessionManager.create(effectiveCwd, sessionDir);

    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(this.agentDir, { recursive: true });

    const customTools = await this.getCustomTools(sessionKey);
    const rawSystemPrompt = await this.getSystemPrompt(sessionKey, metadata);
    const resourceLoader = await this.createResourceLoader(rawSystemPrompt, effectiveCwd);

    log.debug(`Creating agent session for ${sessionKey} in ${effectiveCwd}. (with ${customTools.length} tools and ${rawSystemPrompt?.length} chars system prompt).`);

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

    // Store system prompt in session directory
    if (process.env.LOG_LEVEL === 'debug') {
      log.debug(`Storing system prompt and custom tools in session directory: ${sessionDir}`);
      await Promise.all([
        fs.writeFile(path.join(sessionDir, `systemPrompt.md`), session.systemPrompt ?? '', 'utf-8'),
        fs.writeFile(path.join(sessionDir, `customTools.md`), customTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n'), 'utf-8'),
      ]);
    }

    this.subscribeToSessionEvents(session, sessionKey);

    this.sessions.set(sessionKey, session);
    return session;
  }

  /**
   * Subscribe to PiAgent sessionsubscription - emit to bus for streaming + debug logging.
   */
  protected subscribeToSessionEvents(session: AgentSession, sessionKey: string): void {
    session.subscribe((event: AgentSessionEvent) => {
      const eventType = event.type;

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
          const e = event as { error?: unknown };
          const response = this.extractResponse(session);
          if (e.error) {
            this.bus.emit('agent.onCompleted', {
              sessionKey,
              success: false,
              error: String(e.error),
            });
          } else {
            this.bus.emit('agent.onCompleted', {
              sessionKey,
              success: true,
              response: response || '',
            });
          }
          break;
        }
        case 'agent_end': {
          // Do nothing
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
    const skillsDir = path.join(this.agentDir, 'skills');

    const resourceLoader = new DefaultResourceLoader({
      cwd: effectiveCwd,
      agentDir: this.agentDir,
      settingsManager: this.settings,
      extensionFactories: [],
      additionalSkillPaths: [skillsDir],
      noSkills: false,
      ...(systemPromptOverride && { systemPrompt: systemPromptOverride }),
    });

    await resourceLoader.reload();
    const { skills } = resourceLoader.getSkills();
    log.debug(`Resource loader loaded with ${skills.length} skills.`);
    return resourceLoader;
  }

  /**
   * Build system prompt by merging bootstrap files from workspace, optional cwd, and optional instructionsFile.
   */
  private async getSystemPrompt(sessionKey: string, metadata?: EventMap['agent.execute']['params']['metadata']): Promise<string | undefined> {
    const bootstrapFiles = ['CLAUDE.md', 'AGENTS.md', 'SOUL.md', 'TOOLS.md'];
    const maxCharsPerFile = 6000;

    const dirs = this.collectBootstrapDirs(metadata);

    // Collect bootstrap file paths and instructionsFile
    const filePathsToLoad: Array<{ type: 'bootstrap' | 'instructions'; dir?: string; filename?: string; path: string }> = [];
    for (const dir of dirs) {
      for (const filename of bootstrapFiles) {
        filePathsToLoad.push({
          type: 'bootstrap',
          dir,
          filename,
          path: path.join(dir, filename),
        });
      }
    }

    if (metadata?.instructionsFile) {
      filePathsToLoad.push({
        type: 'instructions',
        path: metadata.instructionsFile,
      });
    }

    // Load all files in parallel
    const fileContents = await Promise.all(
      filePathsToLoad.map(async (item) => {
        try {
          const content = await fs.readFile(item.path, 'utf-8');

          if (item.type === 'bootstrap') {
            const truncated = truncate(content, maxCharsPerFile);
            log.debug(`Loaded ${item.dir}/${item.filename}: ${truncated.length} chars`);
            return {
              label: `<!-- ${item.dir}/${item.filename} -->`,
              content: truncated.trim(),
            };
          } else {
            // instructionsFile: validate extension, parse frontmatter, extract body
            if (!item.path.endsWith('.md')) {
              log.error(`instructionsFile must be a .md file: ${item.path}`);
              return null;
            }

            const parsed = parseFrontmatter(content);
            if (!parsed) {
              log.debug(`instructionsFile has no frontmatter: ${item.path}`);
              return null;
            }

            if (parsed.meta.type !== 'prompt') {
              log.debug(`instructionsFile type is not 'prompt': ${parsed.meta.type}`);
              return null;
            }

            const body = truncate(parsed.body, maxCharsPerFile);
            log.debug(`Loaded instructionsFile: ${item.path} (${body.length} chars)`);
            return {
              label: `<!-- ${item.path} -->`,
              content: body.trim(),
            };
          }
        } catch {
          const label = item.type === 'bootstrap' ? `${item.dir}/${item.filename}` : item.path;
          log.debug(`${label}: not found`);
          return null;
        }
      }),
    );

    // Collect non-null results in order
    const sections: string[] = [];
    for (const result of fileContents) {
      if (result) {
        sections.push(result.label, result.content, '');
      }
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
   * Load custom tools from bus callable events.
   */
  protected async getCustomTools(sessionKey: string): Promise<ToolDefinition[]> {
    return await createCustomTools(sessionKey, this.bus);
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
    const { type: channelId, id: userId } = parseSessionKey(sessionKey);
    return {
      CHANNEL_ID: channelId,
      USER_ID: userId,
      ...(metadata?.channelType && { CHANNEL_TYPE: metadata.channelType }),
      ...(metadata?.fromUser && { FROM_USER: metadata.fromUser }),
      ...(metadata?.botName && { BOT_NAME: metadata.botName }),
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
   * Extract the last assistant message from the session.
   * Handles both string and multipart content (text blocks).
   */
  private extractResponse(session: AgentSession): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = (session as any).state?.messages || [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === 'assistant' && msg.content) {
        // Handle string content
        if (typeof msg.content === 'string') {
          return msg.content;
        }
        // Handle multipart content (text blocks in arrays)
        if (Array.isArray(msg.content)) {
          return msg.content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((block: any) => block.type === 'text')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((block: any) => block.text || '')
            .filter(Boolean)
            .join('\n');
        }
      }
    }

    return '';
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
  return { stop: () => runtime.stop() };
}
