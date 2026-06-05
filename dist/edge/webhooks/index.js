/**
 * Webhooks edge service — inbound HTTP webhooks that trigger agent runs.
 *
 * Callable: webhook.search
 * Subscribes: agent.onCompleted (delivery to notify targets)
 *
 * Inbound flow: POST /hooks/:id → validate token → transform payload
 *   → session create/addMessage → agent.execute → deliver to notify targets
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
import http from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { getDataPaths } from '../../lib/paths.js';
import { webhookSessionKey, parseSessionKey } from '../../lib/session-key.js';
import { paginate } from '../../lib/paginate.js';
import { passthroughTransform, loadTransform } from './transform.js';
const log = createLogger('webhooks');
const MAX_BODY = 1024 * 1024; // 1 MB
const HOOK_ID_RE = /^[a-z0-9_-]+$/i;
const HTTP_PORT = 9002;
const HTTP_HOST = '127.0.0.1';
// ── WebhooksEdge ──────────────────────────────────────────────────────────────
let WebhooksEdge = (() => {
    let _instanceExtraInitializers = [];
    let _search_decorators;
    return class WebhooksEdge {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _search_decorators = [register('webhook.search', {
                    description: 'List registered webhook endpoints.',
                    schema: z.object({
                        query: z.string().optional(),
                        page: z.number(),
                        limit: z.number().optional(),
                    }),
                })];
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        bus = __runInitializers(this, _instanceExtraInitializers);
        config;
        hooks;
        activeHooks = new Set();
        server = null;
        unsubscribeCompleted;
        constructor(bus, config) {
            this.bus = bus;
            this.config = config;
            this.hooks = new Map(config.webhooks.map(h => [h.id, h]));
        }
        async start() {
            this.unsubscribeCompleted = this.bus.on('agent.onCompleted', (payload) => this.onAgentCompleted(payload));
            await this.startHttp();
            this.bus.bootstrap(this);
            log.info(`started with ${this.hooks.size} webhook(s) on ${HTTP_HOST}:${HTTP_PORT}`);
        }
        async stop() {
            this.unsubscribeCompleted?.();
            await this.stopHttp();
        }
        // ── Callable handler ─────────────────────────────────────────────────────
        async search(params) {
            // Strip tokens — never expose secrets
            const all = Array.from(this.hooks.values()).map(({ id, name, transform, notify }) => ({ id, name, token: '', transform, notify }));
            const filtered = params.query
                ? all.filter(h => h.id.includes(params.query) || h.name.includes(params.query))
                : all;
            return paginate(filtered, params.page, params.limit ?? 20);
        }
        // ── Agent completed handler ───────────────────────────────────────────────
        onAgentCompleted(payload) {
            const parsed = parseSessionKey(payload.sessionKey);
            if (parsed.type !== 'webhook')
                return;
            // webhookSessionKey format: "webhook:<hookId>:<timestamp>"
            const hookId = parsed.id.replace(/:\d+$/, '');
            this.activeHooks.delete(hookId);
        }
        // ── HTTP server ───────────────────────────────────────────────────────────
        startHttp() {
            return new Promise((resolve, reject) => {
                this.server = http.createServer((req, res) => this.handleRequest(req, res));
                this.server.headersTimeout = 10_000;
                this.server.requestTimeout = 30_000;
                this.server.on('error', reject);
                this.server.listen(HTTP_PORT, HTTP_HOST, () => {
                    log.info(`http listening on ${HTTP_HOST}:${HTTP_PORT}`);
                    resolve();
                });
            });
        }
        stopHttp() {
            const srv = this.server;
            if (!srv)
                return Promise.resolve();
            this.server = null;
            return new Promise(resolve => srv.close(() => resolve()));
        }
        // ── Request handling ──────────────────────────────────────────────────────
        handleRequest(req, res) {
            if (req.method !== 'POST' || !req.url?.startsWith('/hooks/')) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
                return;
            }
            const hookId = req.url.slice('/hooks/'.length).split('?')[0];
            if (!HOOK_ID_RE.test(hookId)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid hook ID' }));
                return;
            }
            const hook = this.hooks.get(hookId);
            if (!hook) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unknown hook' }));
                return;
            }
            // Timing-safe comparison (hash prevents length leakage)
            const auth = req.headers.authorization ?? '';
            const expectedHash = createHash('sha256').update(`Bearer ${hook.token}`).digest();
            const authHash = createHash('sha256').update(auth).digest();
            if (!timingSafeEqual(authHash, expectedHash)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }
            const chunks = [];
            let size = 0;
            let destroyed = false;
            req.on('error', () => {
                if (!res.writableEnded) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Request error' }));
                }
            });
            req.on('data', (chunk) => {
                if (destroyed)
                    return;
                size += chunk.length;
                if (size > MAX_BODY) {
                    destroyed = true;
                    req.destroy();
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Payload too large' }));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => {
                if (res.writableEnded)
                    return;
                // Respond immediately — fire and forget
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                let payload;
                try {
                    payload = JSON.parse(Buffer.concat(chunks).toString());
                }
                catch {
                    payload = {};
                }
                this.fireHook(hook, payload).catch(err => log.error(`fire hook ${hookId}: ${toMessage(err)}`));
            });
        }
        // ── Fire ──────────────────────────────────────────────────────────────────
        async fireHook(hook, payload) {
            const { dataDir } = getDataPaths();
            const task = hook.transform
                ? await loadTransform(hook.transform, dataDir).then(fn => fn(payload))
                : passthroughTransform(payload);
            const sessionKey = webhookSessionKey(hook.id);
            log.info(`fired: ${hook.id} → ${sessionKey}`);
            this.activeHooks.add(hook.id);
            const result = await this.bus.call('agent.execute', { sessionKey, task });
            if (result.response && hook.notify?.length) {
                log.info(`${hook.id} delivering response to ${hook.notify.length} targets`);
                await Promise.all(hook.notify.map(target => this.bus.call('channel.send', {
                    sessionKey: target,
                    text: result.response,
                    fromSessionKey: sessionKey,
                }).catch(err => log.error(`notify send to ${target}: ${toMessage(err)}`))));
            }
        }
    };
})();
export { WebhooksEdge };
// ── Boot ───────────────────────────────────────────────────────────────────────
export async function boot(bus) {
    const config = await bus.call('config.get', {});
    const svc = new WebhooksEdge(bus, config);
    await svc.start();
    return { stop: () => svc.stop() };
}
//# sourceMappingURL=index.js.map