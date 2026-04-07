/**
 * Agent v2 — PiAgent-powered runtime with debugging
 *
 * Features:
 * - PiAgent session persistence
 * - PiAgent ResourceLoader for skills/prompts
 * - Debug mode for inspecting tools, prompts, history
 * - Override points for customization
 */

import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { parseDirectives } from '../../lib/directives.js';
import type { AgentDeps } from './schema.js';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

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

// Local imports
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

  protected workspaceDir: string;
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

    this.workspaceDir = this.getWorkspaceDir();
    this.agentDir = path.join(this.workspaceDir, 'agent');
    this.sessionsDir = path.join(this.workspaceDir, 'sessions');

    this.authStorage = new AuthStorage();
    this.modelRegistry = new ModelRegistry(this.authStorage);

    // PiAgent owns settings (thinkingLevel, thinkingBudgets, retry, compaction)
    // persisted at ~/.vargos/agent/settings.json
    this.settings = SettingsManager.create(this.workspaceDir, this.agentDir);

    // Register providers from config — passthrough with sensible model defaults
    for (const [name, provider] of Object.entries(this.config.providers)) {
      this.authStorage.setRuntimeApiKey(name, provider.apiKey);
      this.modelRegistry.registerProvider(name, {
        ...provider,
        models: provider.models?.map(m => ({ ...MODEL_DEFAULTS, ...m })) as any,
      });
    }

    // Sync the active model from our config → PiAgent settings
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
    }),
  })
  async execute(params: EventMap['agent.execute']['params']): Promise<EventMap['agent.execute']['result']> {
    const directives = parseDirectives(params.task);
    const task = directives.cleaned || params.task;

    const session = await this.getOrCreateSession(params.sessionKey, params.cwd);

    if (directives.thinkingLevel) {
      session.agent.setThinkingLevel(directives.thinkingLevel);
    }

    // Debug: log session state before prompt
    if (this.debugMode) {
      this.logSessionState(session, params.sessionKey);
    }

    await session.prompt(task);

    const response = this.extractResponse(session);

    return { response };
  }

  /**
   * Get or create AgentSession for sessionKey.
   */
  protected async getOrCreateSession(sessionKey: string, cwd?: string): Promise<AgentSession> {
    const cached = this.sessions.get(sessionKey);
    if (cached) return cached;

    const effectiveCwd = cwd ?? this.workspaceDir;

    const sessionDir = path.join(this.sessionsDir, sessionKey);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(this.agentDir, { recursive: true });

    // Create SessionManager for this sessionKey
    const sessionManager = SessionManager.create(this.workspaceDir, sessionDir);

    // Get custom tools from subclass
    const customTools = await this.getCustomTools(sessionKey);

    // Build system prompt — merges bootstrap files from workspace + cwd
    const systemPrompt = await this.getSystemPrompt(sessionKey, cwd);

    // Debug: log system prompt and tools before creating session
    if (this.debugMode) {
      this.logSystemPrompt(systemPrompt);
      this.logTools(customTools);
    }

    // Load skills + resource loader — merges workspace + cwd
    const resourceLoader = await this.createResourceLoader(systemPrompt, cwd);

    // Resolve active model from "provider:modelId" ref
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

    // Call post-create hook for history injection
    await this.onSessionCreated(session, sessionKey);

    // Debug: subscribe to all events
    session.subscribe((event) => {
      const eventType = event.type || 'unknown';

      if (eventType === 'message_update') {
        return;
      }

      log.info(`[DEBUG] Event "${sessionKey}" ${eventType}:`, JSON.stringify(event, null, 2).slice(0, 500));
    });

    this.sessions.set(sessionKey, session);
    return session;
  }

  /**
   * Create ResourceLoader with merged skills from workspace + cwd.
   * Skills from cwd override workspace skills with the same name.
   */
  protected async createResourceLoader(systemPromptOverride?: string, cwd?: string): Promise<DefaultResourceLoader> {
    const effectiveCwd = cwd ?? this.workspaceDir;
    const skills = this.loadSkillsFromDirs(cwd);

    // Append skills section to system prompt if we have any
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
   * cwd skills with the same name take precedence over workspace skills.
   */
  private loadSkillsFromDirs(cwd?: string): Skill[] {
    const dirs = [path.join(this.workspaceDir, 'skills')];
    if (cwd && path.resolve(cwd) !== path.resolve(this.workspaceDir)) {
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

  // ── Override Points ────────────────────────────────────────────────────────

  /**
   * Build system prompt by merging bootstrap files from workspace and optional cwd.
   * Scans CLAUDE.md, AGENTS.md, SOUL.md, TOOLS.md from each directory.
   * Workspace files load first; cwd files append (if cwd differs from workspace).
   */
  protected async getSystemPrompt(_sessionKey: string, cwd?: string): Promise<string | undefined> {
    const sections: string[] = [];
    const bootstrapFiles = ['CLAUDE.md', 'AGENTS.md', 'SOUL.md', 'TOOLS.md'];
    const maxCharsPerFile = 6000;

    // Deduplicated scan dirs: workspace first, then cwd if different
    const dirs = [this.workspaceDir];
    if (cwd && path.resolve(cwd) !== path.resolve(this.workspaceDir)) {
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
   * Override to provide custom tools.
   * By default, loads all bus callable events with @register decorators.
   */
  protected async getCustomTools(sessionKey: string): Promise<ToolDefinition[]> {
    return await createCustomTools(sessionKey, this.bus);
  }

  /**
   * Override to inject custom history into session.
   * Called after session creation, before first prompt.
   * 
   * Debug mode logs: history entries count, last entry type.
   */
  protected async onSessionCreated(session: AgentSession, sessionKey: string): Promise<void> {
    // Debug: log history state before any injection
    if (this.debugMode) {
      const entries = session.sessionManager.getEntries();
      log.info(`[DEBUG] History on session create "${sessionKey}": ${entries.length} entries`);

      if (entries.length > 0) {
        const last3 = entries.slice(-3);
        last3.forEach(e => {
          log.info(`  - ${e.type}: ${e.id.slice(0, 8)}... at ${e.timestamp}`);
        });
      }
    }

    // Override in subclass to inject history
    // Example:
    // const messages = await this.bus.call('session.getMessages', { sessionKey });
    // if (messages.length > 0) {
    //   session.agent.replaceMessages(this.convertToAgentMessages(messages));
    // }
  }

  /**
   * Override to customize history message conversion.
   */
  protected convertToAgentMessages(messages: unknown[]): unknown[] {
    // Override in subclass to customize conversion logic
    return messages;
  }

  // ── Debug Mode ─────────────────────────────────────────────────────────────

  /**
   * Log system prompt for debugging.
   */
  protected logSystemPrompt(systemPrompt?: string): void {
    if (!systemPrompt) {
      log.info('[DEBUG] System Prompt: (none - using PiAgent default)');
      return;
    }

    const lines = systemPrompt.split('\n');
    log.info(`[DEBUG] System Prompt: ${lines.length} lines, ${systemPrompt.length} chars`);

    // Log first 30 lines as preview
    const preview = lines.slice(0, 30).join('\n');
    log.info(`[DEBUG] Preview:\n${preview}`);

    if (lines.length > 30) {
      log.info(`[DEBUG] ... (${lines.length - 30} more lines)`);
    }
  }

  /**
   * Log tools for debugging.
   */
  protected logTools(tools: ToolDefinition[]): void {
    log.info(`[DEBUG] Tools: ${tools.length} registered`);
    tools.forEach(t => {
      const params = t.parameters?.properties
        ? Object.keys(t.parameters.properties as Record<string, unknown>).join(', ')
        : 'none';
      log.info(`  - ${t.name}: ${t.description.slice(0, 80)}... (params: ${params})`);
    });
  }

  /**
   * Log session state for debugging.
   */
  protected logSessionState(session: AgentSession, sessionKey: string): void {
    try {
      const entries = session.sessionManager.getEntries();

      log.info(`[DEBUG] Session "${sessionKey}":`);
      log.info(`  Entries: ${entries.length}`);

      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1];
        log.info(`  Last Entry: ${lastEntry.type} at ${lastEntry.timestamp}`);
      }

      // Log tools via session state
      const state = session.agent.state;
      if (state && (state as any).tools) {
        const tools = (state as any).tools as any[];
        log.info(`  Tools: ${tools.map(t => t.name).join(', ') || 'none'}`);
      }
    } catch (err) {
      log.warn(`[DEBUG] Failed to log session state: ${err}`);
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private extractResponse(session: AgentSession): string {
    const entries = session.sessionManager.getEntries();

    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === 'message') {
        const msg = (entry as any).message;
        if (msg?.role === 'assistant' && msg.content) {
          if (typeof msg.content === 'string') return msg.content;
          if (Array.isArray(msg.content)) {
            return msg.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text || '')
              .filter(Boolean)
              .join('\n');
          }
        }
      }
    }

    return '';
  }

  protected getWorkspaceDir(): string {
    return process.env.VARGOS_WORKSPACE_DIR ?? path.join(process.env.HOME || '', '.vargos');
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
