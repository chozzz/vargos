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
import { htmlToMarkdown } from '../../lib/html.js';
import { validateHttpResponse } from '../../lib/http-validate.js';
let WebService = (() => {
    let _instanceExtraInitializers = [];
    let _fetch_decorators;
    return class WebService {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _fetch_decorators = [register('web.fetch', {
                    description: 'Fetch a URL and return readable content (HTML → markdown).',
                    schema: z.object({
                        url: z.string().describe('HTTP or HTTPS URL'),
                        extractMode: z.enum(['markdown', 'text']).optional().describe('Output format (default: markdown)'),
                        maxChars: z.number().optional().describe('Max characters to return (default: 50000)'),
                    }),
                })];
            __esDecorate(this, null, _fetch_decorators, { kind: "method", name: "fetch", static: false, private: false, access: { has: obj => "fetch" in obj, get: obj => obj.fetch }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        async fetch(params) {
            let url;
            try {
                url = new URL(params.url);
            }
            catch {
                throw new Error('Invalid URL');
            }
            if (!['http:', 'https:'].includes(url.protocol))
                throw new Error('Only http/https URLs are supported');
            const resp = await fetch(params.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Vargos/2.0)' },
                redirect: 'follow',
            });
            validateHttpResponse(resp, 'Web fetch');
            const contentType = resp.headers.get('content-type') ?? '';
            const html = await resp.text();
            const maxChars = params.maxChars ?? 50_000;
            let text = contentType.includes('text/html') ? htmlToMarkdown(html) : html;
            if (params.extractMode === 'text')
                text = stripMarkdownLinks(text);
            const truncated = text.length > maxChars;
            if (truncated)
                text = text.slice(0, maxChars) + '\n… (truncated)';
            return { text };
        }
        constructor() {
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
})();
export { WebService };
function stripMarkdownLinks(md) {
    return md
        .replace(/!\[[^\]]*]\([^)]+\)/g, '')
        .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n').trim();
}
// ── Boot ─────────────────────────────────────────────────────────────────────
export async function boot(bus) {
    bus.bootstrap(new WebService());
    return {};
}
//# sourceMappingURL=index.js.map