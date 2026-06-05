/**
 * Agent — PiAgent-powered runtime
 *
 * Features:
 * - PiAgent session persistence
 * - PiAgent ResourceLoader for skills/prompts
 * - Debug mode for inspecting tools, prompts, history
 * - Streaming events passthrough to bus (agent.onDelta, agent.onTool, agent.onCompleted)
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { z } from 'zod';
import path from 'node:path';
import { register } from '../../gateway/decorators.js';
import { createLogger } from '../../lib/logger.js';
import { parseDirectives } from './directives.js';
import { withTimeout } from '../../lib/timeout.js';
import { interpolatePrompt } from './prompt-interpolate.js';
import { truncate } from '../../lib/truncate.js';
import { existsSync, promises as fs } from 'node:fs';
import { getDataPaths } from '../../lib/paths.js';
import { parseSessionKey, isSubagentSession } from '../../lib/session-key.js';
// Pi SDK imports
import { createAgentSession, SessionManager, SettingsManager, AuthStorage, ModelRegistry, DefaultResourceLoader, } from '@earendil-works/pi-coding-agent';
import { createCustomTools } from './tools.js';
import { loadChannelPersona, loadSubagentPersona } from './persona.js';
import { resolveSkillPaths } from './skills.js';
import { matchesGlob } from '../../lib/glob-match.js';
const log = createLogger('agent');
// Hardcoded agent execution constants
const EXECUTION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
// ── AgentService ─────────────────────────────────────────────────────────────
let AgentService = (() => {
    let _instanceExtraInitializers = [];
    let _execute_decorators;
    let _appendMessage_decorators;
    let _status_decorators;
    return class AgentService {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _execute_decorators = [register('agent.execute', {
                    description: 'Executes a task with the agent, optionally delegating to a subagent.',
                    schema: z.object({
                        /**
                         * `sessionKey` is intentionally not registered as schema here because when agent.execute is called as a tool from within an agent session, the `sessionKey` is auto-injected by wrapEventAsToolDefinition(). For direct calls from channels, cron, webhooks, TCP, the `sessionKey` is provided in the EventMap and is required for execution.
                         * @see wrapEventAsToolDefinition in tools.ts for how `sessionKey` is injected when called as a tool.
                         */
                        task: z.string().describe('The task to execute.'),
                        cwd: z.string().optional().describe('Working directory for the agent — defaults to workspace dir.'),
                        model: z.string().optional().describe('Optional model override as "provider:modelId" (e.g. "anthropic:claude-opus-4"). Omit to use the agent default — an unknown value falls back to the default.'),
                    }),
                })];
            _appendMessage_decorators = [register('agent.appendMessage')];
            _status_decorators = [register('agent.status', {
                    description: 'Return currently active agent session keys.',
                    schema: z.object({ sessionKey: z.string().optional() }),
                })];
            __esDecorate(this, null, _execute_decorators, { kind: "method", name: "execute", static: false, private: false, access: { has: obj => "execute" in obj, get: obj => obj.execute }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _appendMessage_decorators, { kind: "method", name: "appendMessage", static: false, private: false, access: { has: obj => "appendMessage" in obj, get: obj => obj.appendMessage }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        bus = __runInitializers(this, _instanceExtraInitializers);
        config;
        sessions = new Map();
        activeRuns = new Set();
        agentDir;
        authStorage;
        modelRegistry;
        settings;
        constructor(deps) {
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
            }
            catch (err) {
                log.warn(`Failed to persist retry settings: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        /**
         * agent.execute — Run a task
         *
         * Note: sessionKey is declared optional here because it's auto-injected by
         * wrapEventAsToolDefinition() when the agent calls this as a tool. Direct callers
         * (channels, cron, webhooks, TCP) still provide sessionKey via EventMap.
         */
        async execute(params) {
            if (!params.sessionKey) {
                throw new Error('sessionKey is required for agent.execute');
            }
            log.debug(`execute: START ${params.sessionKey}`);
            // Fall back to the session's default model when the override is missing or unknown,
            // instead of failing the run (agents sometimes pass an ill-formed or stale model id).
            let model = params.model;
            if (model && !this.isValidModel(model)) {
                log.warn(`agent.execute: ignoring invalid model "${model}" (expected provider:modelId) — using default`);
                model = undefined;
            }
            const directives = parseDirectives(params.task);
            const task = interpolatePrompt(directives.cleaned || params.task);
            const session = await this.getOrCreateSession(params.sessionKey, { cwd: params.cwd, model });
            if (directives.thinkingLevel) {
                session.setThinkingLevel(directives.thinkingLevel);
            }
            this.activeRuns.add(params.sessionKey);
            const startTime = Date.now();
            const modelTag = `${session.model?.provider}:${session.model?.id}`;
            try {
                await withTimeout(session.prompt(task, { streamingBehavior: 'steer' }), EXECUTION_TIMEOUT_MS, `Agent execution timeout after ${EXECUTION_TIMEOUT_MS}ms`);
            }
            finally {
                this.activeRuns.delete(params.sessionKey);
            }
            const { content, error } = this.extractFinalAssistant(session);
            if (error) {
                log.error(`execute: ${params.sessionKey} ended with error [model=${modelTag}]: ${error}`);
                throw new Error(error);
            }
            const elapsed = Date.now() - startTime;
            log.info(`${params.sessionKey} → ${content.length} chars in ${elapsed}ms (${modelTag})`);
            return { response: content };
        }
        /**
         * agent.appendMessage — Append message to session JSONL without executing agent.
         * Records inbound messages in session history (observe-only for non-whitelisted).
         * Internal only — not exposed as an agent tool.
         */
        async appendMessage(params) {
            const session = await this.getOrCreateSession(params.sessionKey);
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
        async status(_params) {
            return { activeRuns: Array.from(this.activeRuns) };
        }
        /**
         * Get or create AgentSession for sessionKey.
         * Uses SessionManager.continueRecent() to load the latest session file,
         * preserving conversation history across restarts.
         */
        async getOrCreateSession(sessionKey, options) {
            const cached = this.sessions.get(sessionKey);
            if (cached) {
                return cached;
            }
            const paths = getDataPaths();
            const effectiveCwd = options?.cwd ?? paths.dataDir;
            const sessionDir = path.join(paths.sessionsDir, sessionKey.replace(/:/g, path.sep));
            // Use continueRecent to find and load the latest session file (preserves history).
            // Falls back to create() if no existing session file is found.
            let sessionManager;
            try {
                sessionManager = SessionManager.create(effectiveCwd, sessionDir);
            }
            catch (err) {
                if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
                    // File was created by another code path (e.g. concurrent message for same session).
                    // Fall back to continueRecent which opens existing files gracefully.
                    log.debug(`session ${sessionKey}: create() hit EEXIST, falling back to continueRecent()`);
                    sessionManager = SessionManager.continueRecent(effectiveCwd, sessionDir);
                }
                else {
                    throw err;
                }
            }
            await fs.mkdir(sessionDir, { recursive: true });
            await fs.mkdir(this.agentDir, { recursive: true });
            const persona = await this.loadPersonaIfChannel(sessionKey);
            const customTools = await this.getCustomTools(sessionKey, persona?.meta.allowedTools);
            const rawSystemPrompt = await this.getSystemPrompt(sessionKey, persona?.body);
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
                await fs.writeFile(path.join(debugDir, `systemPrompt.md`), session.systemPrompt ?? '', 'utf-8');
            }
            this.subscribeToSessionEvents(session, sessionKey);
            this.sessions.set(sessionKey, session);
            return session;
        }
        /**
         * Subscribe to PiAgent sessionsubscription - emit to bus for streaming + debug logging.
         */
        subscribeToSessionEvents(session, sessionKey) {
            session.subscribe((event) => {
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
                        const e = event;
                        if (e.toolName) {
                            this.bus.emit('agent.onTool', {
                                sessionKey,
                                toolName: e.toolName,
                                phase: 'start',
                                args: (e.args ?? {}),
                            });
                        }
                        break;
                    }
                    case 'tool_execution_end': {
                        const e = event;
                        if (e.toolName) {
                            this.bus.emit('agent.onTool', {
                                sessionKey,
                                toolName: e.toolName,
                                phase: 'end',
                                result: (e.result ?? {}),
                            });
                        }
                        break;
                    }
                    case 'message_update': {
                        const e = event;
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
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const model = session.model ?? 'unknown';
                            log.error(`agent_end with error for ${sessionKey} [model=${model}]: ${error}`);
                            this.bus.emit('agent.onCompleted', { sessionKey, success: false, error });
                        }
                        else {
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
        async createResourceLoader(systemPromptOverride, cwd) {
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
        async loadPersonaIfChannel(sessionKey) {
            if (isSubagentSession(sessionKey))
                return loadSubagentPersona();
            const { type } = parseSessionKey(sessionKey);
            const isChannel = this.config.channels.some(c => c.id === type);
            if (!isChannel)
                return null;
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
        async getSystemPrompt(sessionKey, personaBody) {
            if (isSubagentSession(sessionKey)) {
                return personaBody?.trim() || undefined;
            }
            const bootstrapFiles = ['AGENTS.md', 'SOUL.md', 'TOOLS.md'];
            const maxCharsPerFile = 6000;
            const dirs = [getDataPaths().workspaceDir];
            const filePathsToLoad = [];
            for (const dir of dirs) {
                for (const filename of bootstrapFiles) {
                    filePathsToLoad.push({ dir, filename, path: path.join(dir, filename) });
                }
            }
            const fileContents = await Promise.all(filePathsToLoad.map(async (item) => {
                try {
                    const content = await fs.readFile(item.path, 'utf-8');
                    const truncated = truncate(content, maxCharsPerFile);
                    log.debug(`Loaded ${item.dir}/${item.filename}: ${truncated.length} chars`);
                    return {
                        label: `<!-- ${item.dir}/${item.filename} -->`,
                        content: truncated.trim(),
                    };
                }
                catch {
                    log.debug(`${item.dir}/${item.filename}: not found`);
                    return null;
                }
            }));
            const sections = [];
            for (const result of fileContents) {
                if (result)
                    sections.push(result.label, result.content, '');
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
            return interpolatePrompt(prompt, { SESSION_KEY: sessionKey });
        }
        /**
         * Load custom tools from bus callable events. When `allowedPatterns` is provided
         * (from a channel persona), filter the tool list down to names matching at least
         * one glob pattern. Empty/undefined patterns = all tools allowed.
         */
        async getCustomTools(sessionKey, allowedPatterns) {
            const tools = await createCustomTools(sessionKey, this.bus);
            if (!allowedPatterns?.length)
                return tools;
            // Match on `label` (original event name with dots, e.g. "memory.search")
            // rather than `name` (sanitized with dashes, e.g. "memory-search"),
            // so that frontmatter patterns like "memory.*" work as expected.
            return tools.filter(t => allowedPatterns.some(p => matchesGlob(p, t.label)));
        }
        /**
         * Validate model override if provided.
         */
        isValidModel(modelSpec) {
            const [provider, modelId] = modelSpec.split(':');
            return !!this.modelRegistry.find(provider, modelId);
        }
        // ── Private Helpers ────────────────────────────────────────────────────────
        /**
         * Extract the final assistant message: text content + error (when stopReason === 'error').
         * Pi SDK records inference failures (e.g. missing API key) as assistant messages with
         * empty content and `errorMessage` populated, instead of throwing — without inspecting
         * `stopReason`/`errorMessage` here, those would surface as silent empty completions.
         */
        extractFinalAssistant(session) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messages = session.state?.messages || [];
            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (msg?.role !== 'assistant')
                    continue;
                let error;
                if (msg.stopReason === 'error') {
                    error = msg.errorMessage ?? 'unknown inference error';
                    // Log full message details for debugging connection/auth issues
                    log.debug('agent error details:', {
                        stopReason: msg.stopReason,
                        errorMessage: msg.errorMessage,
                        model: session.model,
                        messageCount: messages.length,
                    });
                }
                let content = '';
                if (typeof msg.content === 'string') {
                    content = msg.content;
                }
                else if (Array.isArray(msg.content)) {
                    content = msg.content
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .filter((block) => block.type === 'text')
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .map((block) => block.text || '')
                        .filter(Boolean)
                        .join('\n');
                }
                return error ? { content, error } : { content };
            }
            return { content: '' };
        }
        stop() {
            this.sessions.forEach((_session) => {
                _session.dispose();
            });
            this.sessions.clear();
        }
    };
})();
export { AgentService };
// ── Boot ─────────────────────────────────────────────────────────────────────
export async function boot(bus) {
    const config = await bus.call('config.get', {});
    const runtime = new AgentService({ bus, config });
    bus.bootstrap(runtime);
    await runtime.start(); // Persist retry settings
    return { stop: () => runtime.stop() };
}
//# sourceMappingURL=index.js.map