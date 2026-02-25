import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage<number>();
const DEBUG = process.env.DEBUG;
const enabled = !!DEBUG;
const filter = DEBUG && DEBUG !== '1'
  ? new Set(DEBUG.split(','))
  : null;

function ts(): string {
  const now = new Date();
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(Math.floor(now.getMilliseconds() / 100));
  return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
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
