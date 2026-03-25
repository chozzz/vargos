import type { Bus } from '../gateway/bus.js';
import type { Json } from '../gateway/events.js';

let _bus: Bus | null = null;

/** Called once by LogService.boot() to wire the global logger to the bus. */
export function setLoggerBus(bus: Bus): void {
  _bus = bus;
}

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`;
}

export function createLogger(service: string) {
  function write(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Json) {
    if (_bus) {
      _bus.emit('log', { level, service, message, ...(data !== undefined ? { data } : {}) });
    } else {
      console.error(`${ts()} [${service}] ${level.toUpperCase()} ${message}`, data ?? '');
    }
  }

  return {
    debug: (msg: string, data?: Json) => write('debug', msg, data),
    info:  (msg: string, data?: Json) => write('info',  msg, data),
    warn:  (msg: string, data?: Json) => write('warn',  msg, data),
    error: (msg: string, data?: Json) => write('error', msg, data),
  };
}

export function emitError(service: string, err: unknown, context?: Record<string, Json>): void {
  const message = err instanceof Error ? err.message : String(err);
  createLogger(service).error(message, context as Json);
}

/**
 * Minimal pino-compatible silent logger for Baileys.
 * Avoids the pino import just for a no-op.
 */
export const pinoSilent = {
  level:  'silent',
  trace:  () => {},
  debug:  () => {},
  info:   () => {},
  warn:   () => {},
  error:  () => {},
  fatal:  () => {},
  silent: () => {},
  child:  () => pinoSilent,
};
