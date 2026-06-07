/**
 * Channel service — manages external messaging adapters.
 *
 * Callable: channel.send, channel.sendMedia, channel.search, channel.get, channel.register
 * Pure events emitted: channel.onConnected, channel.onDisconnected
 * Pure events subscribed: agent.onDelta, agent.onTool, agent.onCompleted
 *
 * Inbound flow:
 *   adapter → normalizer → pipeline → expand links → whitelist check → agent.execute
 *   agent.onTool updates reaction phase
 *   agent.onCompleted stops typing + seals reaction + delivers reply
 *
 * Reply routing:
 *   - Channel-triggered: agent.onCompleted looks up activeSessions, delivers to source
 *   - Non-channel (cron, etc): agent.onCompleted ignored — caller is responsible for reply delivery
 *
 * Outbound flow: channel.send → strip markdown → chunk → adapter.send
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
import { on, register } from '../../gateway/decorators.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { stripMarkdown } from '../../lib/strip-markdown.js';
import { parseChannelTarget } from '../../lib/session-key.js';
import { paginate } from '../../lib/paginate.js';
import { deliverReply } from './delivery.js';
import { extractMediaPaths } from './media-paths.js';
import { InboundMessagePipeline } from './pipeline.js';
import { loadProviders } from './provider-loader.js';
const log = createLogger('channels');
const TOOL_ARGS_PREVIEW_CHARS = 160;
function formatToolLog(payload) {
    const base = `agent.onTool: ${payload.sessionKey} ${payload.toolName} ${payload.phase}`;
    if (payload.phase !== 'start')
        return base;
    const args = JSON.stringify(payload.args);
    if (!args || args === '{}')
        return base;
    const preview = args.length > TOOL_ARGS_PREVIEW_CHARS
        ? `${args.slice(0, TOOL_ARGS_PREVIEW_CHARS)}...`
        : args;
    return `${base} args=${preview}`;
}
// ── Provider Registry ──────────────────────────────────────────────────────────
class ChannelRegistry {
    providers = new Map();
    register(provider) {
        this.providers.set(provider.type, provider);
    }
    has(type) {
        return this.providers.has(type);
    }
    types() {
        return [...this.providers.keys()];
    }
    async createAdapter(entry, deps) {
        const provider = this.providers.get(entry.type);
        if (!provider) {
            log.warn(`no provider for channel type: ${entry.type}`);
            return null;
        }
        return provider.createAdapter(entry.id, entry, deps);
    }
}
// ── ChannelService ─────────────────────────────────────────────────────────────
let ChannelService = (() => {
    let _instanceExtraInitializers = [];
    let _send_decorators;
    let _sendMedia_decorators;
    let _search_decorators;
    let _get_decorators;
    let _register_decorators;
    let _onAgentTool_decorators;
    let _onAgentCompleted_decorators;
    return class ChannelService {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _send_decorators = [register('channel.send', {
                    description: 'Send a text message to a channel recipient. Optional `fromSessionKey` will trigger agent.appendMessage to record the text in target history.',
                    schema: z.object({
                        sessionKey: z.string(),
                        text: z.string(),
                        fromSessionKey: z.string().optional(),
                    }),
                })];
            _sendMedia_decorators = [register('channel.sendMedia', {
                    description: 'Send a media file to a channel recipient.',
                    schema: z.object({
                        sessionKey: z.string(),
                        filePath: z.string(),
                        mimeType: z.string(),
                        caption: z.string().optional(),
                    }),
                })];
            _search_decorators = [register('channel.search', {
                    description: 'List connected channel adapters.',
                    schema: z.object({
                        query: z.string().optional(),
                        page: z.number().default(1),
                        limit: z.number().default(20),
                    }),
                })];
            _get_decorators = [register('channel.get', {
                    description: 'Get status of a specific channel adapter.',
                    schema: z.object({ instanceId: z.string() }),
                })];
            _register_decorators = [register('channel.register', {
                    description: 'Dynamically register a new channel adapter. `type` must match a loaded provider (e.g. telegram, whatsapp).',
                    // Flat object required: discriminatedUnion produces type:null in JSON Schema, rejected by Anthropic API.
                    // `type` is a free string validated at runtime against loaded providers — keeps this open to new
                    // providers without re-listing them here (the config union remains the authority for persistence).
                    schema: z.object({
                        id: z.string(),
                        type: z.string(),
                        enabled: z.boolean().optional(),
                        model: z.string().optional(),
                        debounceMs: z.number().int().min(0).optional(),
                        allowFrom: z.array(z.string()).optional(),
                        cwd: z.string().optional(),
                        botToken: z.string().optional(),
                        persist: z.boolean().optional(),
                    }),
                })];
            _onAgentTool_decorators = [on('agent.onTool')];
            _onAgentCompleted_decorators = [on('agent.onCompleted')];
            __esDecorate(this, null, _send_decorators, { kind: "method", name: "send", static: false, private: false, access: { has: obj => "send" in obj, get: obj => obj.send }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _sendMedia_decorators, { kind: "method", name: "sendMedia", static: false, private: false, access: { has: obj => "sendMedia" in obj, get: obj => obj.sendMedia }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _register_decorators, { kind: "method", name: "register", static: false, private: false, access: { has: obj => "register" in obj, get: obj => obj.register }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onAgentTool_decorators, { kind: "method", name: "onAgentTool", static: false, private: false, access: { has: obj => "onAgentTool" in obj, get: obj => obj.onAgentTool }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onAgentCompleted_decorators, { kind: "method", name: "onAgentCompleted", static: false, private: false, access: { has: obj => "onAgentCompleted" in obj, get: obj => obj.onAgentCompleted }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        bus = __runInitializers(this, _instanceExtraInitializers);
        config;
        adapters = new Map();
        activeSessions = new Map();
        registry = new ChannelRegistry();
        pipeline;
        constructor(bus, config) {
            this.bus = bus;
            this.config = config;
            this.pipeline = new InboundMessagePipeline(bus, config);
        }
        async start() {
            await this.registerProviders();
            this.startAllConfigured();
        }
        async registerProviders() {
            const providers = await loadProviders();
            for (const provider of providers) {
                this.registry.register(provider);
            }
        }
        async stop() {
            for (const adapter of this.adapters.values()) {
                try {
                    await adapter.stop();
                }
                catch { /* best effort */ }
            }
            this.adapters.clear();
        }
        // ── Callable handlers ────────────────────────────────────────────────────────
        async send(params) {
            const { sessionKey, text, fromSessionKey } = params;
            const target = parseChannelTarget(sessionKey);
            if (!target)
                throw new Error(`Invalid session key: ${sessionKey}`);
            const adapter = this.adapters.get(target.channel);
            if (!adapter)
                throw new Error(`No adapter for channel: ${target.channel}`);
            log.info(`send: ${sessionKey} (${text.length} chars) channel=${target.channel}`);
            const cleaned = stripMarkdown(text);
            await deliverReply((chunk) => adapter.send(sessionKey, chunk), cleaned);
            // Mark session as replied so onAgentCompleted knows agent sent its own reply
            const session = this.activeSessions.get(sessionKey);
            if (session)
                session.replied = true;
            log.info(`send: completed ${sessionKey}`);
            if (adapter.sendMedia) {
                const files = extractMediaPaths(text);
                for (const { filePath, mimeType } of files) {
                    await adapter.sendMedia(sessionKey, filePath, mimeType)
                        .catch(err => log.error(`media send failed: ${filePath}: ${err}`));
                }
            }
            if (fromSessionKey) {
                this.bus.call('agent.appendMessage', {
                    sessionKey,
                    content: `[${fromSessionKey}] ${text}`,
                }).catch(err => log.error(`history append to ${sessionKey} from ${fromSessionKey}: ${toMessage(err)}`));
            }
            return { sent: true };
        }
        async sendMedia(params) {
            const { sessionKey, filePath, mimeType, caption } = params;
            const target = parseChannelTarget(sessionKey);
            if (!target)
                throw new Error(`Invalid session key: ${sessionKey}`);
            const adapter = this.adapters.get(target.channel);
            if (!adapter)
                throw new Error(`No adapter for channel: ${target.channel}`);
            if (!adapter.sendMedia)
                throw new Error(`Channel ${target.channel} does not support media`);
            await adapter.sendMedia(sessionKey, filePath, mimeType, caption);
            return { sent: true };
        }
        async search(params) {
            const all = Array.from(this.adapters.values()).map(a => ({
                instanceId: a.instanceId,
                type: a.type,
                status: a.status,
            }));
            const filtered = params.query
                ? all.filter(c => c.instanceId.includes(params.query) || c.type.includes(params.query))
                : all;
            return paginate(filtered, params.page ?? 1, params.limit ?? 20);
        }
        async get(params) {
            const adapter = this.adapters.get(params.instanceId);
            if (!adapter)
                throw new Error(`No adapter for channel: ${params.instanceId}`);
            return { instanceId: adapter.instanceId, type: adapter.type, status: adapter.status };
        }
        async register(params) {
            if (!this.registry.has(params.type)) {
                throw new Error(`Unknown channel type: ${params.type}. Loaded providers: ${this.registry.types().join(', ')}`);
            }
            if (this.adapters.has(params.id)) {
                log.info(`channel already registered: ${params.id}`);
                return;
            }
            const { persist, ...entry } = params;
            await this.startChannel(entry);
            if (persist) {
                const config = await this.bus.call('config.get', {});
                const exists = config.channels.some(c => c.id === entry.id);
                if (!exists) {
                    await this.bus.call('config.set', {
                        ...config,
                        channels: [...config.channels, entry],
                    });
                }
            }
        }
        // ── Agent event handlers ──────────────────────────────────────────────────────
        onAgentTool(payload) {
            const session = this.activeSessions.get(payload.sessionKey);
            if (!session)
                return;
            if (payload.sessionKey.includes(':subagent')) {
                log.debug(`agent.onTool: subagent, skipping reaction`);
                return;
            }
            log.debug(formatToolLog(payload));
            if (payload.phase === 'start') {
                if (session.reactionController) {
                    session.reactionController.setTool();
                }
                // Resume typing if it was paused (long-running tool)
                session.adapter.resumeTyping(payload.sessionKey);
            }
            else {
                if (session.reactionController) {
                    session.reactionController.setThinking();
                }
            }
        }
        onAgentCompleted(payload) {
            if (!payload.sessionKey || payload.sessionKey.includes(':subagent'))
                return;
            const session = this.activeSessions.get(payload.sessionKey);
            if (!session) {
                // Non-channel session (cron, webhook, etc.) — expected, ignore.
                log.debug(`onAgentCompleted: session not found: ${payload.sessionKey}`);
                return;
            }
            // agent.onCompleted (pi's agent_end) fires once at the true end of the run — even with
            // steering, where a second message's agent.execute settles early. So THIS is the cleanup
            // anchor, not the execute promise: claim + remove the session now. The captured `session`
            // object still serves the async reply send + reaction seal below. `completed` guards the
            // pipeline catch against a double-send.
            session.completed = true;
            this.activeSessions.delete(payload.sessionKey);
            const sessionKey = payload.sessionKey;
            const text = payload.success ? (payload.response ?? '') : `Error: ${payload.error || 'Unknown error'}`;
            log.info(`→ ${sessionKey} ${payload.success ? '✓' : '✗'} (${text.length} chars)`);
            // Send on error (always), or on a successful response the agent didn't already deliver
            // via the channel-send tool.
            const shouldSend = !payload.success || (!session.replied && !!payload.response);
            const finalize = () => this.pipeline.finalize(session, sessionKey, payload.success !== false);
            if (!shouldSend) {
                finalize();
                return;
            }
            this.bus.call('channel.send', { sessionKey, text })
                .then(({ sent }) => log.debug(`→ ${sessionKey} sent=${sent}`))
                .catch(err => log.error(`failed to send reply: ${toMessage(err)}`))
                .finally(finalize);
        }
        // ── Inbound message handling ─────────────────────────────────────────────────
        /**
         * Process a normalized inbound message from an adapter.
         * Called by adapters after normalizing their raw message format.
         */
        async onInboundMessage(sessionKey, message) {
            const target = parseChannelTarget(sessionKey);
            if (!target) {
                log.debug(`invalid session key: ${sessionKey}`);
                return;
            }
            const adapter = this.adapters.get(target.channel);
            if (!adapter) {
                log.debug(`no adapter for channel: ${target.channel}`);
                return;
            }
            // Delegate to pipeline for policy orchestration
            log.debug(`onInboundMessage: Running pipeline process for ${sessionKey}`);
            await this.pipeline.process(sessionKey, message, adapter, this.activeSessions);
        }
        // ── Channel startup ──────────────────────────────────────────────────────────
        async startChannel(entry) {
            const adapter = await this.createAdapter(entry);
            if (!adapter) {
                log.warn(`unknown channel type: ${entry.type} (id=${entry.id})`);
                return;
            }
            this.adapters.set(entry.id, adapter);
            try {
                await adapter.start();
                log.info(`channel started: ${entry.id} (${entry.type})`);
                this.bus.emit('channel.onConnected', { instanceId: entry.id, type: entry.type });
            }
            catch (err) {
                log.error(`channel start failed: ${entry.id}: ${toMessage(err)}`);
                this.bus.emit('channel.onDisconnected', { instanceId: entry.id });
            }
        }
        async createAdapter(entry) {
            const deps = {
                onInbound: this.onInboundMessage.bind(this),
                transcribe: (filePath) => this.bus.call('media.transcribeAudio', { filePath }).then(r => r.text),
                describe: (filePath) => this.bus.call('media.describeImage', { filePath }).then(r => r.description),
                extract: (filePath, mimeType) => this.bus.call('media.extractDocument', { filePath, mimeType }),
            };
            return this.registry.createAdapter(entry, deps);
        }
        async startAllConfigured() {
            log.info(`starting all configured ${this.config.channels.length} channels...`);
            for (const entry of this.config.channels) {
                if (entry.enabled === false) {
                    log.info(`channel skipped (disabled): ${entry.id}`);
                    continue;
                }
                try {
                    await this.startChannel(entry);
                }
                catch (err) {
                    log.error(`failed to start channel ${entry.id}: ${toMessage(err)}`);
                }
            }
            if (this.adapters.size > 0) {
                log.info(`started ${this.adapters.size} channel(s)`);
            }
        }
    };
})();
export { ChannelService };
// ── Boot ───────────────────────────────────────────────────────────────────────
export async function boot(bus) {
    const config = await bus.call('config.get', {});
    const svc = new ChannelService(bus, config);
    await svc.start();
    bus.bootstrap(svc);
    return { stop: () => svc.stop() };
}
//# sourceMappingURL=index.js.map