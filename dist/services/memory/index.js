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
import path from 'node:path';
import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import { getDataPaths } from '../../lib/paths.js';
import { MemoryContext } from './context.js';
import { MemorySQLiteStorage } from './sqlite-storage.js';
import { createLogger } from '../../lib/logger.js';
let MemoryService = (() => {
    let _instanceExtraInitializers = [];
    let _search_decorators;
    let _read_decorators;
    let _write_decorators;
    let _stats_decorators;
    return class MemoryService {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _search_decorators = [register('memory.search', {
                    description: 'Semantically search MEMORY.md + memory/*.md for relevant content.',
                    schema: z.object({
                        query: z.string().describe('Search query'),
                        maxResults: z.number().optional().describe('Max results (default 6)'),
                        minScore: z.number().optional().describe('Min relevance score 0-1 (default 0.3)'),
                    }),
                })];
            _read_decorators = [register('memory.read', {
                    description: 'Read a file from the workspace memory directory.',
                    schema: z.object({
                        path: z.string().describe('Relative path within workspace'),
                        from: z.number().optional().describe('Start line (1-based)'),
                        lines: z.number().optional().describe('Number of lines to read'),
                    }),
                })];
            _write_decorators = [register('memory.write', {
                    description: 'Write or append to a file in the workspace memory directory.',
                    schema: z.object({
                        path: z.string().describe('Relative path within workspace'),
                        content: z.string(),
                        mode: z.enum(['overwrite', 'append']).optional().describe('Default: overwrite'),
                    }),
                })];
            _stats_decorators = [register('memory.stats', {
                    description: 'Get memory index stats (file count, chunk count, last sync).',
                    schema: z.object({}),
                })];
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _read_decorators, { kind: "method", name: "read", static: false, private: false, access: { has: obj => "read" in obj, get: obj => obj.read }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _write_decorators, { kind: "method", name: "write", static: false, private: false, access: { has: obj => "write" in obj, get: obj => obj.write }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _stats_decorators, { kind: "method", name: "stats", static: false, private: false, access: { has: obj => "stats" in obj, get: obj => obj.stats }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        bus = __runInitializers(this, _instanceExtraInitializers);
        log = createLogger('memory');
        context;
        constructor(bus) {
            this.bus = bus;
            const { workspaceDir, cacheDir, sessionsDir, dataDir } = getDataPaths();
            const storage = new MemorySQLiteStorage(path.join(dataDir, 'memory.db'));
            this.context = new MemoryContext({
                memoryDir: workspaceDir,
                cacheDir,
                sessionsDir,
                storage,
                enableFileWatcher: true
            });
        }
        async initialize() {
            this.log.info('Initializing memory service');
            await this.context.initialize();
        }
        async close() {
            this.log.info('Closing memory service');
            await this.context.close();
        }
        async search(params) {
            const results = await this.context.search(params.query, {
                maxResults: params.maxResults,
                minScore: params.minScore,
            });
            return results.map(r => ({
                citation: r.citation,
                score: r.score,
                content: r.chunk.content,
                startLine: r.chunk.startLine,
                endLine: r.chunk.endLine,
            }));
        }
        async read(params) {
            return this.context.readFile({ relPath: params.path, from: params.from, lines: params.lines });
        }
        async write(params) {
            await this.context.writeFile(params.path, params.content, params.mode ?? 'overwrite');
        }
        async stats(_params) {
            return this.context.getStats();
        }
    };
})();
export { MemoryService };
// ── Boot ──────────────────────────────────────────────────────────────────────
export async function boot(bus) {
    const service = new MemoryService(bus);
    await service.initialize();
    bus.bootstrap(service);
    return { stop: () => service.close() };
}
//# sourceMappingURL=index.js.map