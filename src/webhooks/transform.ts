export type TransformFn = (payload: unknown) => string;

const cache = new Map<string, TransformFn>();

export function passthroughTransform(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

export async function loadTransform(modulePath: string): Promise<TransformFn> {
  const cached = cache.get(modulePath);
  if (cached) return cached;

  const mod = await import(modulePath);
  const fn: TransformFn = mod.default ?? mod.transform;
  if (typeof fn !== 'function') {
    throw new Error(`Transform module "${modulePath}" must export a function`);
  }
  cache.set(modulePath, fn);
  return fn;
}
