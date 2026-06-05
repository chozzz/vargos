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
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { on, register } from '../../gateway/decorators.js';
import { setLoggerBus, ts } from '../../lib/logger.js';
import { getDataPaths } from '../../lib/paths.js';
let LogService = (() => {
    let _instanceExtraInitializers = [];
    let _onLog_decorators;
    let _search_decorators;
    return class LogService {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _onLog_decorators = [on('log.onLog')];
            _search_decorators = [register('log.search', {
                    description: 'Search persisted log entries by level and/or service.',
                    schema: z.object({
                        sinceMs: z.number().optional().describe('Only return entries newer than this many ms ago'),
                        service: z.string().optional(),
                        level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
                    }),
                })];
            __esDecorate(this, null, _onLog_decorators, { kind: "method", name: "onLog", static: false, private: false, access: { has: obj => "onLog" in obj, get: obj => obj.onLog }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        logFile = (__runInitializers(this, _instanceExtraInitializers), null);
        currentDate = '';
        onLog(payload) {
            const { level, service, message, data } = payload;
            const line = `${ts()} [${service}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
            if (level === 'debug') {
                console.debug(line);
            }
            else if (level === 'info') {
                console.info(line);
            }
            else if (level === 'warn') {
                console.warn(line);
                this.persist({ ts: new Date().toISOString(), level, service, message, data }).catch(() => { });
            }
            else if (level === 'error') {
                console.error(line);
                this.persist({ ts: new Date().toISOString(), level, service, message, data }).catch(() => { });
            }
        }
        async search(params) {
            const file = this.todayFile();
            let raw;
            try {
                raw = await fs.readFile(file, 'utf-8');
            }
            catch {
                return [];
            }
            const cutoff = params.sinceMs ? new Date(Date.now() - params.sinceMs).toISOString() : undefined;
            const entries = [];
            for (const line of raw.split('\n')) {
                if (!line.trim())
                    continue;
                try {
                    const entry = JSON.parse(line);
                    if (cutoff && entry.ts < cutoff)
                        continue;
                    if (params.level && entry.level !== params.level)
                        continue;
                    if (params.service && entry.service !== params.service)
                        continue;
                    entries.push({
                        service: entry.service,
                        error: entry.message,
                        context: entry.data,
                        timestamp: new Date(entry.ts).getTime(),
                    });
                }
                catch { /* skip */ }
            }
            return entries;
        }
        todayFile() {
            const date = new Date().toISOString().slice(0, 10);
            if (date !== this.currentDate) {
                this.currentDate = date;
                this.logFile = path.join(getDataPaths().logsDir, `logs-${date}.jsonl`);
            }
            return this.logFile;
        }
        async persist(entry) {
            const file = this.todayFile();
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.appendFile(file, JSON.stringify(entry) + '\n');
        }
    };
})();
export { LogService };
// ── Boot ─────────────────────────────────────────────────────────────────────
export async function boot(bus) {
    const svc = new LogService();
    bus.bootstrap(svc);
    setLoggerBus(bus);
    return {};
}
//# sourceMappingURL=index.js.map