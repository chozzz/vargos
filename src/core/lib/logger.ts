import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage<number>();
const DEBUG = process.env.DEBUG;
const enabled = !!DEBUG;
const filter = DEBUG && DEBUG !== '1'
  ? new Set(DEBUG.split(','))
  : null;

export function createLogger(scope: string) {
  const active = enabled && (!filter || filter.has(scope));

  return {
    debug(...args: unknown[]) {
      if (!active) return;
      const depth = store.getStore() ?? 0;
      const indent = '  '.repeat(depth);
      console.error(`${indent}[${scope}]`, ...args);
    },
    error(...args: unknown[]) {
      console.error(`[${scope}]`, ...args);
    },
    child<T>(fn: () => T): T {
      const depth = store.getStore() ?? 0;
      return store.run(depth + 1, fn);
    },
  };
}
