import path from 'node:path';
const cache = new Map();
export function passthroughTransform(payload) {
    return JSON.stringify(payload, null, 2);
}
/**
 * Load a transform module. Path must resolve within baseDir.
 * Caches loaded modules to avoid re-importing.
 */
export async function loadTransform(modulePath, baseDir) {
    const cached = cache.get(modulePath);
    if (cached)
        return cached;
    // Restrict to baseDir (dataDir) when provided
    if (baseDir) {
        const resolved = path.resolve(baseDir, modulePath);
        if (!resolved.startsWith(path.resolve(baseDir))) {
            throw new Error(`Transform path "${modulePath}" escapes data directory`);
        }
    }
    const mod = await import(modulePath);
    const fn = mod.default ?? mod.transform;
    if (typeof fn !== 'function') {
        throw new Error(`Transform module "${modulePath}" must export a function`);
    }
    cache.set(modulePath, fn);
    return fn;
}
//# sourceMappingURL=transform.js.map