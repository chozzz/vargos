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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { register } from '../../gateway/decorators.js';
import { AgentConfigSchema, AuthSchema, ChannelEntrySchema, CronTaskSchema, WebhookEntrySchema, HeartbeatConfigSchema, LinkExpandConfigSchema, ProvidersSchema, McpClientConfigSchema, McpServerConfigSchema, StorageConfigSchema, } from './schemas/index.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';
// ─── App config ───────────────────────────────────────────────────────────────
export const AppConfigSchema = z
    .object({
    providers: ProvidersSchema.optional(),
    agent: AgentConfigSchema.optional(),
    auth: AuthSchema,
    channels: z.array(ChannelEntrySchema).default([]),
    cron: z.object({
        tasks: z.array(CronTaskSchema).optional(),
    }).optional(),
    webhooks: z.array(WebhookEntrySchema).default([]),
    heartbeat: HeartbeatConfigSchema.optional(),
    linkExpand: LinkExpandConfigSchema.default({}),
    mcp: McpClientConfigSchema.default({}),
    mcpServers: z.record(z.string(), McpServerConfigSchema).optional().describe('External MCP servers to load as bus callable events'),
    storage: StorageConfigSchema.optional(),
    media: z.object({
        audio: z.string().optional(),
        image: z.string().optional(),
    }).optional(),
    paths: z.object({
        dataDir: z.string().optional(),
        workspace: z.string().optional(),
    }).default({}),
    gateway: z.object({
        host: z.string().optional().default('127.0.0.1'),
        port: z.number().int().min(1).max(65535).default(9000),
        /** Client socket idle timeout (ms) for JSON-RPC connections */
        requestTimeout: z.number().int().positive().optional(),
    }).default({})
})
    .passthrough();
// ─── Load / save ──────────────────────────────────────────────────────────────
export function saveConfig(path, config) {
    writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}
// ─── ConfigService ───────────────────────────────────────────────────────────
let ConfigService = (() => {
    let _instanceExtraInitializers = [];
    let _get_decorators;
    let _set_decorators;
    return class ConfigService {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _get_decorators = [register('config.get', {
                    description: 'Get the current application configuration (merged from config.json, agent/models.json, agent/settings.json).',
                    schema: z.object({}),
                })];
            _set_decorators = [register('config.set', {
                    description: 'Update the application config. Intelligently routes to correct file (config.json, agent/models.json, or agent/settings.json).',
                    schema: z.object({}).passthrough(),
                })];
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _set_decorators, { kind: "method", name: "set", static: false, private: false, access: { has: obj => "set" in obj, get: obj => obj.set }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        bus = __runInitializers(this, _instanceExtraInitializers);
        log = createLogger('config');
        configFile;
        agentDir;
        agentModelsFile;
        agentSettingsFile;
        agentAuthFile;
        constructor(bus) {
            this.bus = bus;
            const { configFile, dataDir } = getDataPaths();
            this.configFile = configFile;
            this.agentDir = path.join(dataDir, 'agent');
            this.agentModelsFile = path.join(this.agentDir, 'models.json');
            this.agentSettingsFile = path.join(this.agentDir, 'settings.json');
            this.agentAuthFile = path.join(this.agentDir, 'auth.json');
        }
        loadConfig() {
            const raw = JSON.parse(readFileSync(this.configFile, 'utf8'));
            // Load agent/settings.json and merge with existing agent config (settings takes precedence)
            try {
                const settingsContent = readFileSync(this.agentSettingsFile, 'utf8');
                const settings = JSON.parse(settingsContent);
                if (settings && typeof settings === 'object') {
                    raw.agent = { ...raw.agent, ...settings };
                }
            }
            catch {
                // File may not exist yet — validation will catch if required
            }
            // Load agent/models.json and merge providers
            try {
                const modelsContent = readFileSync(this.agentModelsFile, 'utf8');
                const models = JSON.parse(modelsContent);
                if (models.providers) {
                    raw.providers = models.providers;
                }
            }
            catch {
                // File may not exist yet, that's okay
            }
            // Load auth.json
            try {
                const authContent = readFileSync(this.agentAuthFile, 'utf8');
                const auth = JSON.parse(authContent ?? '{}');
                raw.auth = auth;
            }
            catch {
                // File may not exist yet, that's okay
            }
            // Validate merged config
            const result = AppConfigSchema.safeParse(raw);
            if (!result.success) {
                const issues = result.error.issues
                    .map(i => `  ${i.path.join('.')}: ${i.message}`)
                    .join('\n');
                throw new Error(`Invalid config at ${this.configFile}:\n${issues}`);
            }
            return result.data;
        }
        async get(_params) {
            return this.loadConfig();
        }
        async set(params) {
            const parsed = AppConfigSchema.parse(params);
            // Split config into components by ownership
            const configForFile = { ...parsed };
            const agentModels = {};
            let agentSettings = {};
            let authData = {};
            // Load existing agent/settings.json to preserve other fields
            try {
                agentSettings = JSON.parse(readFileSync(this.agentSettingsFile, 'utf8'));
            }
            catch {
                // File doesn't exist yet
            }
            // Extract agent config to agent/settings.json
            if (configForFile.agent) {
                agentSettings = { ...agentSettings, ...configForFile.agent };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                delete configForFile.agent;
            }
            // Load existing auth.json to preserve other credentials
            try {
                authData = JSON.parse(readFileSync(this.agentAuthFile, 'utf8'));
            }
            catch {
                // File doesn't exist yet
            }
            // Extract auth credentials to agent/auth.json
            if (configForFile.auth) {
                authData = { ...authData, ...configForFile.auth };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                delete configForFile.auth;
            }
            // Extract providers to agent/models.json
            if (configForFile.providers) {
                agentModels.providers = configForFile.providers;
                delete configForFile.providers;
            }
            // Load existing agent/models.json to preserve other fields
            try {
                const existing = JSON.parse(readFileSync(this.agentModelsFile, 'utf8'));
                Object.assign(agentModels, existing, agentModels); // Preserve existing, override with new
            }
            catch {
                // File doesn't exist yet
            }
            // Persist to appropriate files
            saveConfig(this.configFile, configForFile);
            const writeAgentFile = (file, data) => {
                if (Object.keys(data).length === 0)
                    return;
                if (!existsSync(this.agentDir))
                    mkdirSync(this.agentDir, { recursive: true });
                writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
            };
            writeAgentFile(this.agentModelsFile, agentModels);
            writeAgentFile(this.agentSettingsFile, agentSettings);
            writeAgentFile(this.agentAuthFile, authData);
            this.log.info('config updated and persisted');
            return this.loadConfig();
        }
    };
})();
export { ConfigService };
// ── Boot ─────────────────────────────────────────────────────────────────────
export async function boot(bus) {
    const svc = new ConfigService(bus);
    bus.bootstrap(svc);
    return {};
}
// ── Re-exports ────────────────────────────────────────────────────────────────
export * from './schemas/index.js';
//# sourceMappingURL=index.js.map