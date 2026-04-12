import type { Bus } from '../gateway/bus.js';
import type { Json } from '../gateway/events.js';

let _bus: Bus | null = null;

/** Called once by LogService.boot() to wire the global logger to the bus. */
export function setLoggerBus(bus: Bus): void {
  _bus = bus;
}

export function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`;
}

export function createLogger(service: string) {
  function write(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Json) {
    if (_bus) {
      _bus.emit('log.onLog', { level, service, message, ...(data !== undefined ? { data } : {}) });
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

