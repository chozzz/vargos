/**
 * Agent v2 — PiAgent-powered runtime
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
  loadSkillsFromDir,
  formatSkillsForPrompt,
  type AgentSession,
  type ToolDefinition,
  type Skill,
} from '@mariozechner/pi-coding-agent';

// ImageContent type for vision models (matches @mariozechner/pi-ai)
type ImageContent = {
  type: 'image';
  data: string;
  mimeType: string;
};

import { createCustomTools } from './tools.js';

const log = createLogger('agent-v2');

const MODEL_DEFAULTS = {
  reasoning: false,
  input: ['text', 'image'] as ('text' | 'image')[],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
};

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

  protected dataDir: string;
  protected agentDir: string;
  protected sessionsDir: string;
  protected authStorage: AuthStorage;
  protected modelRegistry: ModelRegistry;
  protected settings: SettingsManager;
  protected debugMode: boolean;

  constructor(deps: AgentDeps) {
    this.bus = deps.bus;
    this.config = deps.config;
    this.debugMode = process.env.AGENT_DEBUG === 'true';

    const paths = getDataPaths();
    this.dataDir = paths.dataDir;
    this.agentDir = path.join(this.dataDir, 'agent');
    this.sessionsDir = paths.sessionsDir;

    this.authStorage = new AuthStorage();
    this.modelRegistry = new ModelRegistry(this.authStorage);

    this.settings = SettingsManager.create(this.dataDir, this.agentDir);

    for (const [name, provider] of Object.entries(this.config.providers)) {
      this.authStorage.setRuntimeApiKey(name, provider.apiKey);
      this.modelRegistry.registerProvider(name, {
        ...provider,
        models: provider.models?.map(m => ({ ...MODEL_DEFAULTS, ...m })) as any,
      });
    }

    const { provider, modelId } = parseModelRef(this.config.agent.model);
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

    await session.prompt(task, { images });

    const response = this.extractResponse(session);

    return { response };
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

    if (this.debugMode) {
      this.logSystemPrompt(systemPrompt);
      this.logTools(customTools);
    }

    const resourceLoader = await this.createResourceLoader(systemPrompt, cwd);

    const { provider: p, modelId: mId } = parseModelRef(this.config.agent.model);
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
   * Subscribe to PiAgent events — emit to bus for streaming + debug logging.
   */
  protected subscribeToSessionEvents(session: AgentSession, sessionKey: string): void {
    session.subscribe((event) => {
      const eventType = event.type || 'unknown';

      if (this.debugMode && eventType !== 'message_update') {
        log.info(`[DEBUG] Event "${sessionKey}" ${eventType}:`, JSON.stringify(event, null, 2).slice(0, 500));
      }

      // Map PiAgent events to our bus events
      if (eventType === 'tool_execution_start') {
        this.bus.emit('agent.onTool', {
          sessionKey,
          toolName: (event as any).toolName || 'unknown',
          phase: 'start',
          args: (event as any).args,
        });
      } else if (eventType === 'tool_execution_end') {
        this.bus.emit('agent.onTool', {
          sessionKey,
          toolName: (event as any).toolName || 'unknown',
          phase: 'end',
          result: (event as any).result,
        });
      } else if (eventType === 'message_update') {
        const delta = (event as any).delta || (event as any).text || '';
        if (delta) {
          this.bus.emit('agent.onDelta', { sessionKey, chunk: delta });
        }
      } else if (eventType === 'agent_end' || eventType === 'turn_end') {
        const response = this.extractResponse(session);
        this.bus.emit('agent.onCompleted', {
          sessionKey,
          success: eventType !== 'agent_end' || !(event as any).error,
          response: response || undefined,
          error: (event as any).error,
        });
      }
    });
  }

  /**
   * Create ResourceLoader with merged skills from workspace + cwd.
   */
  protected async createResourceLoader(systemPromptOverride?: string, cwd?: string): Promise<DefaultResourceLoader> {
    const effectiveCwd = cwd ?? this.dataDir;
    const skills = this.loadSkillsFromDirs(cwd);

    let finalSystemPrompt = systemPromptOverride;
    if (skills.length > 0) {
      const skillsSection = formatSkillsForPrompt(skills);
      finalSystemPrompt = finalSystemPrompt
        ? `${finalSystemPrompt}\n\n${skillsSection}`
        : skillsSection;
    }

    const resourceLoader = new DefaultResourceLoader({
      cwd: effectiveCwd,
      agentDir: this.agentDir,
      settingsManager: this.settings,
      extensionFactories: [],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      ...(finalSystemPrompt && { systemPrompt: finalSystemPrompt }),
      agentsFilesOverride: () => ({ agentsFiles: [] }),
    });

    await resourceLoader.reload();
    return resourceLoader;
  }

  /**
   * Load skills from workspace/skills/ and optionally cwd/skills/.
   */
  private loadSkillsFromDirs(cwd?: string): Skill[] {
    const dirs = [path.join(this.dataDir, 'skills')];
    if (cwd && path.resolve(cwd) !== path.resolve(this.dataDir)) {
      dirs.push(path.join(cwd, 'skills'));
    }

    const byName = new Map<string, Skill>();

    for (const dir of dirs) {
      try {
        const { skills } = loadSkillsFromDir({ dir, source: 'workspace' });
        for (const skill of skills) {
          byName.set(skill.name, skill);
        }
        if (this.debugMode && skills.length > 0) {
          log.info(`[DEBUG] Loaded ${skills.length} skills from ${dir}`);
          skills.forEach(s => log.info(`  - ${s.name}: ${s.description}`));
        }
      } catch {
        if (this.debugMode) {
          log.info(`[DEBUG] No skills directory at ${dir}`);
        }
      }
    }

    return Array.from(byName.values());
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

          if (this.debugMode) {
            log.info(`[DEBUG] Loaded ${dir}/${filename}: ${content.length} chars`);
          }
        } catch {
          if (this.debugMode) {
            log.info(`[DEBUG] ${dir}/${filename}: not found`);
          }
        }
      }
    }

    if (sections.length === 0) {
      if (this.debugMode) {
        log.info('[DEBUG] No bootstrap files found, using PiAgent default');
      }
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
      log.info('[DEBUG] System Prompt: (none - using PiAgent default)');
      return;
    }

    const lines = systemPrompt.split('\n');
    log.info(`[DEBUG] System Prompt: ${lines.length} lines, ${systemPrompt.length} chars`);
    const preview = lines.slice(0, 30).join('\n');
    log.info(`[DEBUG] Preview:\n${preview}`);

    if (lines.length > 30) {
      log.info(`[DEBUG] ... (${lines.length - 30} more lines)`);
    }
  }

  protected logTools(tools: ToolDefinition[]): void {
    log.info(`[DEBUG] Tools: ${tools.length} registered`);
    tools.forEach(t => {
      const params = t.parameters?.properties
        ? Object.keys(t.parameters.properties as Record<string, unknown>).join(', ')
        : 'none';
      log.info(`  - ${t.name}: ${t.description.slice(0, 80)}... (params: ${params})`);
    });
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private extractResponse(session: AgentSession): string {
    const entries = session.sessionManager.getEntries();

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === 'message') {
        const msg = (entry as any).message;
        if (msg?.role === 'assistant' && msg.content) {
          return this.extractMessageContent(msg) || '';
        }
      }
    }

    return '';
  }

  private extractMessageContent(msg: { content: string | Array<{ type: string; text?: string }> }): string | undefined {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text || '')
        .filter(Boolean)
        .join('\n');
    }
    return undefined;
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
