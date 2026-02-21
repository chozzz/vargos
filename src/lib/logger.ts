import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage<number>();
const DEBUG = process.env.DEBUG;
const enabled = !!DEBUG;
const filter = DEBUG && DEBUG !== '1'
  ? new Set(DEBUG.split(','))
  : null;

const bootTime = Date.now();

function ts(): string {
  const delta = ((Date.now() - bootTime) / 1000).toFixed(1);
  return `+${delta}s`;
}

export function createLogger(scope: string) {
  const active = enabled && (!filter || filter.has(scope));

  return {
    debug(...args: unknown[]) {
      if (!active) return;
      const depth = store.getStore() ?? 0;
      const indent = '  '.repeat(depth);
      console.error(`${ts()} ${indent}[${scope}]`, ...args);
    },
    info(...args: unknown[]) {
      console.error(`${ts()} [${scope}]`, ...args);
    },
    error(...args: unknown[]) {
      console.error(`${ts()} [${scope}] ERROR`, ...args);
    },
    child<T>(fn: () => T): T {
      const depth = store.getStore() ?? 0;
      return store.run(depth + 1, fn);
    },
  };
}

/**
 * Convenience alias for createLogger
 * Maintains compatibility with existing code
 */
export const getLogger = createLogger;
