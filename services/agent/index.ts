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
import { parseDirectives } from '../../lib/directives.js';
import { withTimeout } from '../../lib/timeout.js';
import { interpolatePrompt } from '../../lib/prompt-interpolate.js';
import type { AgentDeps } from './schema.js';
import { promises as fs } from 'node:fs';
import { getDataPaths } from '../../lib/paths.js';

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

// ImageContent type for vision models (matches @mariozechner/pi-ai)
type ImageContent = {
  type: 'image';
  data: string;      // base64 encoded
  mimeType: string;
};

// PiAgent event types for type-safe event mapping
import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';

import { createCustomTools } from './tools.js';

const log = createLogger('agent');

/** Parse "provider:modelId" ref into its parts. */
export function parseModelRef(ref: string): { provider: string; modelId: string } {
  const idx = ref.indexOf(':');
  if (idx < 0) throw new Error(`Invalid model ref "${ref}" — expected "provider:modelId"`);
  return { provider: ref.slice(0, idx), modelId: ref.slice(idx + 1) };
}

// ── AgentService ─────────────────────────────────────────────────────────────

export class AgentService {
  protected bus: Bus;
  protected config: AppConfig;
  protected sessions = new Map<string, AgentSession>();
  private activeRuns = new Set<string>();

  protected dataDir: string;
  protected agentDir: string;
  protected sessionsDir: string;
  protected authStorage: AuthStorage;
  protected modelRegistry: ModelRegistry;
  protected settings: SettingsManager;

  constructor(deps: AgentDeps) {
    this.bus = deps.bus;
    this.config = deps.config;

    const paths = getDataPaths();
    this.dataDir = paths.dataDir;
    this.agentDir = path.join(this.dataDir, 'agent');
    this.sessionsDir = paths.sessionsDir;

    // Use ~/.vargos/agent for auth and models (override PiAgent defaults)
    const authJsonPath = path.join(this.agentDir, 'auth.json');
    const modelsJsonPath = path.join(this.agentDir, 'models.json');

    this.authStorage = AuthStorage.create(authJsonPath);
    this.modelRegistry = ModelRegistry.create(this.authStorage, modelsJsonPath);

    this.settings = SettingsManager.create(this.dataDir, this.agentDir);
    // NOTE: SettingsManager loads ~/.vargos/agent/models.json which has the
    // authoritative provider + model definitions. Pi Agent is the source of truth.
    // config.providers is now optional/deprecated in favor of agent/models.json

    const { provider, modelId } = parseModelRef(this.config.agent!.model);
    this.settings.setDefaultModelAndProvider(provider, modelId);
  }

  /**
   * agent.execute — Run a task
   *
   * Note: sessionKey is declared optional here because it's auto-injected by
   * wrapEventAsToolDefinition() when the agent calls this as a tool. Direct callers
   * (channels, cron, webhooks, TCP) still provide sessionKey via EventMap.
   */
  @register('agent.execute', {
    description: 'Delegates a task to another agent / subagent.',
    schema: z.object({
      // sessionKey is injected by wrapEventAsToolDefinition — the agent never provides it.
      // Declared optional so the decorator's type inference matches the schema shape.
      sessionKey: z.string().optional(),
      task: z.string().describe('The task to delegate to the agent.'),
      cwd: z.string().describe('The working directory for the agent.').optional(),
      thinkingLevel: z.string().describe('Thinking level — passed through to PiAgent.').optional(),
      model: z.string().describe('The default LLM model for the agent. (provider:modelId)').optional(),
      images: z.array(z.object({
        data: z.string(),
        mimeType: z.string(),
      })).describe('The images to pass to the agent.').optional(),
      timeoutMs: z.number().describe('The timeout for the agent.').optional(),
    }),
  })
  async execute(params: EventMap['agent.execute']['params']): Promise<EventMap['agent.execute']['result']> {
    if (!params.sessionKey) {
      throw new Error('sessionKey is required for agent.execute');
    }

    const directives = parseDirectives(params.task);
    const task = interpolatePrompt(directives.cleaned || params.task);

    const session = await this.getOrCreateSession(params.sessionKey, params.cwd);

    const images: ImageContent[] | undefined = params.images?.map(img => ({
      type: 'image' as const,
      data: img.data,
      mimeType: img.mimeType,
    }));

    // Set thinking level on the session (session-level setting, not per-prompt).
    // Priority: task directive > explicit param (channels/cron/tool callers)
    const thinkingLevel = directives.thinkingLevel || params.thinkingLevel;
    if (thinkingLevel) {
      session.setThinkingLevel(thinkingLevel);
    }

    // Apply timeout (use provided timeout or fall back to config default)
    const timeoutMs = params.timeoutMs ?? this.config.agent!.executionTimeoutMs;

    this.activeRuns.add(params.sessionKey);
    try {
      await withTimeout(session.prompt(task, { images, streamingBehavior: 'steer' }), timeoutMs, `Agent execution timeout after ${timeoutMs}ms`);
    } finally {
      this.activeRuns.delete(params.sessionKey);
    }

    const response = this.extractResponse(session);

    return { response };
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
  protected async getOrCreateSession(sessionKey: string, cwd?: string): Promise<AgentSession> {
    const cached = this.sessions.get(sessionKey);
    if (cached) return cached;

    const effectiveCwd = cwd ?? this.dataDir;

    const sessionDir = path.join(this.sessionsDir, sessionKey.replace(/:/g, path.sep));
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(this.agentDir, { recursive: true });

    const sessionManager = SessionManager.create(this.dataDir, sessionDir);

    const customTools = await this.getCustomTools(sessionKey);
    const systemPrompt = await this.getSystemPrompt(sessionKey, cwd);

    // this.logSystemPrompt(systemPrompt);
    // this.logTools(customTools);

    const resourceLoader = await this.createResourceLoader(systemPrompt, cwd);

    const { provider: p, modelId: mId } = parseModelRef(this.config.agent!.model);
    const model = this.modelRegistry.find(p, mId);

    const { session } = await createAgentSession({
      cwd: effectiveCwd,
      agentDir: this.agentDir,
      sessionManager,
      settingsManager: this.settings,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      model,
      tools: [],
      customTools,
      resourceLoader,
    });

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
    const effectiveCwd = cwd ?? this.dataDir;

    const resourceLoader = new DefaultResourceLoader({
      cwd: effectiveCwd,
      agentDir: this.agentDir,
      settingsManager: this.settings,
      extensionFactories: [],
      ...(systemPromptOverride && { systemPrompt: systemPromptOverride }),
    });

    await resourceLoader.reload();
    return resourceLoader;
  }


  /**
   * Build system prompt by merging bootstrap files from workspace and optional cwd.
   */
  private async getSystemPrompt(_sessionKey: string, cwd?: string): Promise<string | undefined> {
    const sections: string[] = [];
    const bootstrapFiles = ['CLAUDE.md', 'AGENTS.md', 'SOUL.md', 'TOOLS.md'];
    const maxCharsPerFile = 6000;

    const paths = getDataPaths();
    const workspaceDir = paths.workspaceDir;

    const dirs = [workspaceDir];
    if (cwd && path.resolve(cwd) !== path.resolve(workspaceDir)) {
      dirs.push(cwd);
    }

    for (const dir of dirs) {
      for (const filename of bootstrapFiles) {
        const filePath = path.join(dir, filename);
        try {
          let content = await fs.readFile(filePath, 'utf-8');

          if (content.length > maxCharsPerFile) {
            const headChars = Math.floor(maxCharsPerFile * 0.7);
            const tailChars = Math.floor(maxCharsPerFile * 0.2);
            content = `${content.slice(0, headChars)}\n\n[...truncated...]\n\n${content.slice(-tailChars)}`;
          }

          sections.push(`<!-- ${dir}/${filename} -->`, content.trim(), '');
          log.debug(`Loaded ${dir}/${filename}: ${content.length} chars`);
        } catch {
          log.debug(`${dir}/${filename}: not found`);
        }
      }
    }

    if (sections.length === 0) {
      log.debug('No bootstrap files found, using PiAgent default');
      return undefined;
    }

    const prompt = sections.join('\n');
    return interpolatePrompt(prompt);
  }

  /**
   * Load custom tools from bus callable events.
   */
  protected async getCustomTools(sessionKey: string): Promise<ToolDefinition[]> {
    return await createCustomTools(sessionKey, this.bus);
  }

  // ── Debug Mode ─────────────────────────────────────────────────────────────

  protected logSystemPrompt(systemPrompt?: string): void {
    if (!systemPrompt) {
      log.debug('System Prompt: (none - using PiAgent default)');
      return;
    }

    const lines = systemPrompt.split('\n');
    log.debug(`System Prompt: ${lines.length} lines, ${systemPrompt.length} chars`);
    log.debug(`Preview:\n${lines.slice(0, 30).join('\n')}`);
    if (lines.length > 30) log.debug(`... (${lines.length - 30} more lines)`);
  }

  protected logTools(tools: ToolDefinition[]): void {
    log.debug(`Tools: ${tools.length} registered`);
    tools.forEach(t => {
      const params = t.parameters?.properties
        ? Object.keys(t.parameters.properties as Record<string, unknown>).join(', ')
        : 'none';
      log.debug(`  - ${t.name}: ${t.description.slice(0, 80)}... (params: ${params})`);
    });
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Extract the last assistant message from the session.
   * Handles both string and multipart content (text blocks).
   */
  private extractResponse(session: AgentSession): string {
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
            .filter((block: any) => block.type === 'text')
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
