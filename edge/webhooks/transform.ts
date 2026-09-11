import path from 'node:path';

export type TransformFn = (payload: unknown) => string | null | undefined;

const cache = new Map<string, TransformFn>();

export function passthroughTransform(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Load a transform module. Path must resolve within baseDir.
 * Caches loaded modules to avoid re-importing.
 *
 * Return value: a non-empty string becomes the agent task; `null`/`undefined`
 * skips the agent run (and notify delivery) for that event — use for dedup,
 * debounce, or rate-limiting in the transform.
 */
export async function loadTransform(modulePath: string, baseDir?: string): Promise<TransformFn> {
  const cached = cache.get(modulePath);
  if (cached) return cached;

  // Restrict to baseDir (dataDir) when provided. The resolved path is what
  // gets imported — a bare `import(modulePath)` would resolve relative paths
  // against this module's file, not dataDir.
  let resolved = modulePath;
  if (baseDir) {
    resolved = path.resolve(baseDir, modulePath);
    if (!resolved.startsWith(path.resolve(baseDir))) {
      throw new Error(`Transform path "${modulePath}" escapes data directory`);
    }
  }

  const mod = await import(resolved);
  const fn: TransformFn = mod.default ?? mod.transform;
  if (typeof fn !== 'function') {
    throw new Error(`Transform module "${modulePath}" must export a function`);
  }
  cache.set(modulePath, fn);
  return fn;
}
