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
import EventEmitter from 'node:events';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { register, HANDLERS, TOOLS } from './decorators.js';
import { createLogger } from '../lib/logger.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
const log = createLogger('bus');
const DEFAULT_CALL_TIMEOUT_MS = 35 * 60 * 1000; // 35 minutes (exceeds agent.execute 30min timeout)
/**
 * Predicate: is this event metadata a usable tool?
 * (type === 'tool', has a description, and has a schema)
 */
export function isToolEvent(metadata) {
    return metadata.type === 'tool' && metadata.description !== '(no description)' && !!metadata.schema;
}
let EventEmitterBus = (() => {
    let _instanceExtraInitializers = [];
    let _restart_decorators;
    let _status_decorators;
    let _search_decorators;
    let _inspect_decorators;
    return class EventEmitterBus {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _restart_decorators = [register('bus.restart', {
                    description: 'Restart a named service: stop it and re-instantiate from the cached module. Resets in-memory state (e.g. a wedged channel) but does NOT reload code from disk — use bus.restartProcess after a git pull for that.',
                    schema: z.object({
                        service: z.string().describe('Service name to restart (e.g., "config", "agent", "channels")'),
                    }),
                })];
            _status_decorators = [register('bus.status', {
                    description: 'List all registered services and their current status.',
                    schema: z.object({}).default({}),
                })];
            _search_decorators = [register('bus.search', {
                    description: 'Search all callable bus events. Optionally filter by query string.',
                    schema: z.object({
                        query: z.string().optional().describe('Filter events by name substring'),
                    }),
                })];
            _inspect_decorators = [register('bus.inspect', {
                    description: 'Get detailed metadata for a specific bus event.',
                    schema: z.object({
                        event: z.string().describe('Event name to inspect'),
                    }),
                })];
            __esDecorate(this, null, _restart_decorators, { kind: "method", name: "restart", static: false, private: false, access: { has: obj => "restart" in obj, get: obj => obj.restart }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _inspect_decorators, { kind: "method", name: "inspect", static: false, private: false, access: { has: obj => "inspect" in obj, get: obj => obj.inspect }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        ee = (__runInitializers(this, _instanceExtraInitializers), new EventEmitter());
        timeoutMs;
        callableRegistry = new Map(); // Callable events from @register + schemas
        handlersRegistry = new Set(); // Handler events from @on
        restartFactories = new Map(); // Service restart callbacks
        teardowns = new Map(); // Bus wiring per service, so restart can un-wire the old instance
        constructor(timeoutMs = DEFAULT_CALL_TIMEOUT_MS) {
            this.timeoutMs = timeoutMs;
            this.ee.setMaxListeners(0); // Disable MaxListeners warning; this is a server with many legitimate listeners
        }
        // ── Bus interface ───────────────────────────────────────────────────────────
        emit(event, payload) {
            this.ee.emit(event, payload);
        }
        on(event, handler) {
            return this.registerHandlers(event, handler);
        }
        /** Check if an event is callable (only events registered via @register). */
        isCallable(eventName) {
            return this.callableRegistry.has(eventName);
        }
        call(event, params) {
            return new Promise((resolve, reject) => {
                const cid = randomUUID();
                const reqEvent = `${event}._req`;
                const resEvent = `${event}._res`;
                const timer = setTimeout(() => {
                    this.ee.off(resEvent, onReply);
                    reject(new Error(`bus.call('${event}') timed out after ${this.timeoutMs}ms`));
                }, this.timeoutMs);
                const onReply = (res) => {
                    if (res._cid !== cid)
                        return;
                    clearTimeout(timer);
                    this.ee.off(resEvent, onReply);
                    if (res.error !== undefined)
                        reject(new Error(res.error));
                    else
                        resolve(res.result);
                };
                this.ee.on(resEvent, onReply);
                this.ee.emit(reqEvent, { params, _cid: cid });
            });
        }
        // ── Service registration (called from boot.ts after instantiation) ─────────
        /**
         * Reads @on and @register decorator metadata from a service instance (or the bus itself
         * if no service provided) and wires all declared handlers to this bus.
         */
        bootstrap(service) {
            const svc = service ?? this;
            const handlers = svc[HANDLERS] ?? [];
            const tools = svc[TOOLS] ?? [];
            // Re-bootstrap (service restart): drop the previous instance's listeners first,
            // otherwise @on/@register handlers stack and fire twice. Keyed by class name,
            // which assumes one service per class (true today — all *Service names are unique).
            this.teardowns.get(svc.constructor.name)?.();
            const offs = [];
            const allEvents = [...handlers.map(e => e.event), ...tools.map(e => e.event)];
            log.info(`bootstrap: ${svc.constructor.name} → [${allEvents.join(', ')}]`);
            // Register @on handlers (pure events)
            for (const { event, method } of handlers) {
                const fn = svc[method];
                if (typeof fn !== 'function')
                    continue;
                this.handlersRegistry.add(event);
                offs.push(this.registerHandlers(event, fn.bind(svc)));
            }
            // Pre-populate callable registry with tools that have schema (agent-callable)
            for (const { event, schema } of tools) {
                if (schema) {
                    this.callableRegistry.set(event, schema);
                }
            }
            for (const { event, method } of tools) {
                const fn = svc[method];
                if (typeof fn !== 'function')
                    continue;
                offs.push(this.registerTools(event, fn.bind(svc)));
            }
            this.teardowns.set(svc.constructor.name, () => offs.forEach(off => off()));
        }
        // ── Runtime tool registration ─────────────────────────────────────────────────
        /**
         * Register a new callable tool at runtime.
         * Used by services (like MCP) to dynamically register tools after boot.
         * Returns an unsubscribe function to remove the tool.
         */
        registerTool(event, handler, schema) {
            // Register in the callable registry
            this.callableRegistry.set(event, schema);
            // Wire the handler using the same pattern as @register decorated methods
            return this.registerTools(event, handler);
        }
        /**
         * Unregister a callable tool that was previously registered at runtime.
         * Returns true if the tool existed and was removed, false otherwise.
         */
        unregisterTool(event) {
            const existed = this.callableRegistry.has(event);
            this.callableRegistry.delete(event);
            return existed;
        }
        // ── Service lifecycle ─────────────────────────────────────────────────────────
        /**
         * Register a restart factory for a named service.
         * Called by boot.ts at boot — internal, not exposed via JSON-RPC.
         * Overwrites any existing factory for the same name (supports restart).
         */
        onRestart(serviceName, factory) {
            this.restartFactories.set(serviceName, factory);
        }
        async restart(params) {
            const factory = this.restartFactories.get(params.service);
            if (!factory)
                throw new Error(`No restart handler registered for service: ${params.service}`);
            await factory();
            return { ok: true };
        }
        async status(_params) {
            const services = Array.from(this.restartFactories.keys()).map(name => ({
                name,
                status: 'running',
            }));
            return { services };
        }
        // ── Bus introspection ─────────────────────────────────────────────────────────
        async search(params) {
            const result = [];
            const query = params?.query;
            // Include handlers
            for (const event of this.handlersRegistry) {
                if (query && !event.includes(query))
                    continue;
                result.push({
                    event,
                    description: '(no description)',
                    type: 'handler',
                });
            }
            // Include tools
            for (const event of this.callableRegistry.keys()) {
                if (query && !event.includes(query))
                    continue;
                const toolSchema = this.callableRegistry.get(event);
                let schema;
                try {
                    if (toolSchema?.schema) {
                        schema = { params: zodToJsonSchema(toolSchema.schema) };
                    }
                }
                catch (err) {
                    log.error(`Failed to convert schema for ${event}: ${err instanceof Error ? err.message : String(err)}`);
                }
                result.push({
                    event,
                    description: toolSchema?.description || '(no description)',
                    type: 'tool',
                    schema,
                });
            }
            return result;
        }
        async inspect(params) {
            // Check if it's a tool
            const toolSchema = this.callableRegistry.get(params.event);
            if (toolSchema) {
                let schema;
                try {
                    if (toolSchema.schema) {
                        schema = { params: zodToJsonSchema(toolSchema.schema) };
                    }
                }
                catch (err) {
                    log.error(`Failed to convert schema for ${params.event}: ${err instanceof Error ? err.message : String(err)}`);
                }
                return {
                    event: params.event,
                    description: toolSchema.description,
                    type: 'tool',
                    schema,
                };
            }
            // Check if it's a handler
            if (this.handlersRegistry.has(params.event)) {
                return {
                    event: params.event,
                    description: '(no description)',
                    type: 'handler',
                };
            }
            return null;
        }
        // ── Internal registration ──────────────────────────────────────────────────────
        registerHandlers(event, handler) {
            this.ee.on(event, handler);
            return () => this.ee.off(event, handler);
        }
        registerTools(event, handler) {
            const reqEvent = `${event}._req`;
            const resEvent = `${event}._res`;
            const wrapper = async (req) => {
                try {
                    const result = await handler(req.params);
                    this.ee.emit(resEvent, { result, _cid: req._cid });
                }
                catch (err) {
                    const error = err instanceof Error ? err.message : String(err);
                    this.ee.emit(resEvent, { result: undefined, error, _cid: req._cid });
                }
            };
            this.ee.on(reqEvent, wrapper);
            return () => this.ee.off(reqEvent, wrapper);
        }
    };
})();
export { EventEmitterBus };
//# sourceMappingURL=emitter.js.map