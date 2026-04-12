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
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { parseDirectives } from '../../lib/directives.js';
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

function isToolStartEvent(event: AgentSessionEvent): event is AgentSessionEvent & { type: 'tool_execution_start'; toolName: string; args: any } {
  return event.type === 'tool_execution_start';
}

function isToolEndEvent(event: AgentSessionEvent): event is AgentSessionEvent & { type: 'tool_execution_end'; toolName: string; result: any } {
  return event.type === 'tool_execution_end';
}

function isMessageUpdateEvent(event: AgentSessionEvent): event is AgentSessionEvent & { type: 'message_update'; delta?: unknown; text?: unknown } {
  return event.type === 'message_update';
}

function isCompletionEvent(event: AgentSessionEvent): event is AgentSessionEvent & { type: 'agent_end' | 'turn_end' } {
  return event.type === 'agent_end' || event.type === 'turn_end';
}

import { createCustomTools } from './tools.js';

const log = createLogger('agent');

/** Parse "provider:modelId" ref into its parts. */
export function parseModelRef(ref: string): { provider: string; modelId: string } {
  const idx = ref.indexOf(':');
  if (idx < 0) throw new Error(`Invalid model ref "${ref}" — expected "provider:modelId"`);
  return { provider: ref.slice(0, idx), modelId: ref.slice(idx + 1) };
}

// ── AgentRuntime ─────────────────────────────────────────────────────────────

export class AgentRuntime {
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

    this.authStorage = new AuthStorage();
    const modelsJsonPath = path.join(this.agentDir, 'models.json');
    this.modelRegistry = new ModelRegistry(this.authStorage, modelsJsonPath);

    this.settings = SettingsManager.create(this.dataDir, this.agentDir);
    // NOTE: SettingsManager loads ~/.vargos/agent/models.json which has the
    // authoritative provider + model definitions. Pi Agent is the source of truth.
    // config.providers is now optional/deprecated in favor of agent/models.json

    const { provider, modelId } = parseModelRef(this.config.agent!.model);
    this.settings.setDefaultModelAndProvider(provider, modelId);
  }

  /**
   * agent.execute — Run a task
   */
  @register('agent.execute', {
    description: 'Run the agent on a task using PiAgent session persistence.',
    schema: z.object({
      sessionKey: z.string(),
      task: z.string(),
      cwd: z.string().optional(),
      thinkingLevel: z.string().optional(),
      model: z.string().optional(),
      images: z.array(z.object({
        data: z.string(),
        mimeType: z.string(),
      })).optional(),
      timeoutMs: z.number().optional(),
    }),
  })
  async execute(params: EventMap['agent.execute']['params']): Promise<EventMap['agent.execute']['result']> {
    const directives = parseDirectives(params.task);
    const task = directives.cleaned || params.task;

    const session = await this.getOrCreateSession(params.sessionKey, params.cwd);

    if (directives.thinkingLevel) {
      session.agent.setThinkingLevel(directives.thinkingLevel);
    }

    const images: ImageContent[] | undefined = params.images?.map(img => ({
      type: 'image' as const,
      data: img.data,
      mimeType: img.mimeType,
    }));

    // Apply timeout (use provided timeout or fall back to config default)
    const timeoutMs = params.timeoutMs ?? this.config.agent!.executionTimeoutMs;

    this.activeRuns.add(params.sessionKey);
    try {
      await this.promptWithTimeout(session, task, { images }, timeoutMs);
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
   * Execute session.prompt with timeout protection.
   * Uses Promise.race to enforce timeouts since session.prompt doesn't natively support timeout.
   */
  private promptWithTimeout(
    session: AgentSession,
    task: string,
    options: { images?: ImageContent[] },
    timeoutMs: number,
  ): Promise<void> {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Agent execution timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([session.prompt(task, options), timeoutPromise]);
  }

  /**
   * Get or create AgentSession for sessionKey.
   */
  protected async getOrCreateSession(sessionKey: string, cwd?: string): Promise<AgentSession> {
    const cached = this.sessions.get(sessionKey);
    if (cached) return cached;

    const effectiveCwd = cwd ?? this.dataDir;

    const sessionDir = path.join(this.sessionsDir, sessionKey);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(this.agentDir, { recursive: true });

    const sessionManager = SessionManager.create(this.dataDir, sessionDir);

    const customTools = await this.getCustomTools(sessionKey);
    const systemPrompt = await this.getSystemPrompt(sessionKey, cwd);

    this.logSystemPrompt(systemPrompt);
    this.logTools(customTools);

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
    session.subscribe(event => {
      const eventType = event.type;

      if (eventType !== 'message_update') {
        log.debug(`Event "${sessionKey}" ${eventType}:`, JSON.stringify(event, null, 2).slice(0, 500));
      }

      // Skip session-specific events (auto_compaction_start, auto_retry_start) - not emitted as bus events
      if (eventType === 'auto_compaction_start' || eventType === 'auto_compaction_end' ||
          eventType === 'auto_retry_start' || eventType === 'auto_retry_end') {
        return;
      }

      // Map PiAgent events to our bus events
      if (isToolStartEvent(event)) {
        this.bus.emit('agent.onTool', {
          sessionKey,
          toolName: event.toolName,
          phase: 'start',
          args: event.args,
        });
      } else if (isToolEndEvent(event)) {
        this.bus.emit('agent.onTool', {
          sessionKey,
          toolName: event.toolName,
          phase: 'end',
          result: event.result,
        });
      } else if (isMessageUpdateEvent(event)) {
        const delta = (event as any).delta || (event as any).text || '';
        if (delta) {
          this.bus.emit('agent.onDelta', { sessionKey, chunk: delta });
        }
      } else if (isCompletionEvent(event)) {
        const response = this.extractResponse(session);
        this.bus.emit('agent.onCompleted', {
          sessionKey,
          success: event.type !== 'agent_end' || !(event as any).error,
          response: response || undefined,
          error: (event as any).error,
        });
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

    const dirs = [this.dataDir];
    if (cwd && path.resolve(cwd) !== path.resolve(this.dataDir)) {
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

    return sections.join('\n');
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
  const runtime = new AgentRuntime({ bus, config });
  bus.bootstrap(runtime);
  return { stop: () => runtime.stop() };
}
