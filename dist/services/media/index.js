/**
 * Media service — audio transcription, image description, and document extraction
 *
 * Callable: media.transcribeAudio, media.describeImage, media.extractDocument
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
import { register } from '../../gateway/decorators.js';
import { createLogger } from '../../lib/logger.js';
import { createProvider } from './providers/index.js';
import { extractDocument } from './providers/document.js';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const log = createLogger('media');
class MediaCache {
    processing = new Map();
    cachePath(filePath) {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        return path.join(dir, `${base}.metadata.json`);
    }
    readCache(filePath) {
        try {
            const cacheFile = this.cachePath(filePath);
            const raw = readFileSync(cacheFile, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    writeCache(filePath, entry) {
        try {
            const cacheFile = this.cachePath(filePath);
            writeFileSync(cacheFile, JSON.stringify(entry, null, 2), 'utf-8');
        }
        catch (err) {
            log.warn(`failed to write media cache for ${filePath}: ${err}`);
        }
    }
    async get(filePath, type, fetcher) {
        // Check file-based cache (cached forever)
        const cached = this.readCache(filePath);
        if (cached?.[type]) {
            return cached[type];
        }
        // Dedup: if another caller is already processing this file, wait for them
        const existing = this.processing.get(filePath);
        if (existing) {
            log.debug(`media dedup: waiting for concurrent ${type} of ${filePath}`);
            return existing;
        }
        // Start processing
        const promise = fetcher().then(result => {
            // Update cache file (merge with existing entries)
            const existing = this.readCache(filePath) ?? {};
            this.writeCache(filePath, { ...existing, [type]: result });
            this.processing.delete(filePath);
            return result;
        }).catch(err => {
            this.processing.delete(filePath);
            throw err;
        });
        this.processing.set(filePath, promise);
        return promise;
    }
}
let MediaService = (() => {
    let _instanceExtraInitializers = [];
    let _transcribeAudio_decorators;
    let _describeImage_decorators;
    let _extractDocument_decorators;
    return class MediaService {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _transcribeAudio_decorators = [register('media.transcribeAudio', {
                    description: 'Transcribe an audio file to text using configured audio model. Results are cached for 24h.',
                    schema: z.object({ filePath: z.string() }),
                })];
            _describeImage_decorators = [register('media.describeImage', {
                    description: 'Describe an image using configured vision model. Results are cached for 24h.',
                    schema: z.object({ filePath: z.string() }),
                })];
            _extractDocument_decorators = [register('media.extractDocument', {
                    description: 'Extract text from documents (PDF, DOCX, XLSX, TXT, MD).',
                    schema: z.object({ filePath: z.string(), mimeType: z.string() }),
                })];
            __esDecorate(this, null, _transcribeAudio_decorators, { kind: "method", name: "transcribeAudio", static: false, private: false, access: { has: obj => "transcribeAudio" in obj, get: obj => obj.transcribeAudio }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _describeImage_decorators, { kind: "method", name: "describeImage", static: false, private: false, access: { has: obj => "describeImage" in obj, get: obj => obj.describeImage }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _extractDocument_decorators, { kind: "method", name: "extractDocument", static: false, private: false, access: { has: obj => "extractDocument" in obj, get: obj => obj.extractDocument }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        bus = __runInitializers(this, _instanceExtraInitializers);
        config;
        cache = new MediaCache();
        constructor(bus, config) {
            this.bus = bus;
            this.config = config;
        }
        resolveProviderConfig(ref) {
            const [provider, model] = ref.split(':');
            if (!provider || !model)
                throw new Error('Invalid config format (expected "provider:model")');
            const authEntry = this.config.auth?.[provider];
            const apiKey = authEntry && 'key' in authEntry ? authEntry.key : null;
            if (!apiKey)
                throw new Error(`No API key configured for ${provider}`);
            return { provider, model, apiKey, baseUrl: this.config.providers?.[provider]?.baseUrl };
        }
        async transcribeAudio(params) {
            const audioRef = this.config.agent?.media?.audio;
            if (!audioRef)
                throw new Error('No audio model configured (agent.media.audio)');
            const { provider, model, apiKey, baseUrl } = this.resolveProviderConfig(audioRef);
            const text = await this.cache.get(params.filePath, 'transcribe', () => createProvider(provider).transcribeAudio(params.filePath, model, apiKey, baseUrl));
            return { text };
        }
        async describeImage(params) {
            const imgRef = this.config.agent?.media?.image;
            if (!imgRef)
                throw new Error('No image model configured (agent.media.image)');
            const { provider, model, apiKey, baseUrl } = this.resolveProviderConfig(imgRef);
            const description = await this.cache.get(params.filePath, 'describe', () => createProvider(provider).describeImage(params.filePath, model, apiKey, baseUrl));
            return { description };
        }
        async extractDocument(params) {
            return extractDocument(params.filePath, params.mimeType);
        }
    };
})();
export { MediaService };
export async function boot(bus) {
    const config = await bus.call('config.get', {});
    const svc = new MediaService(bus, config);
    bus.bootstrap(svc);
    log.debug('media service initialized');
    return {};
}
//# sourceMappingURL=index.js.map