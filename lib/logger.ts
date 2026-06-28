import type { Bus, Json } from '../core/types.js';

let _bus: Bus | null = null;

/** Called once by the log service's init() to route logs through the bus. */
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
      const line = `${ts()} [${service}] ${message}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`;
      if (level === 'warn' || level === 'error') console.error(line);
      else console.log(line);
    }
  }

  return {
    debug: (msg: string, data?: Json) => write('debug', msg, data),
    info:  (msg: string, data?: Json) => write('info',  msg, data),
    warn:  (msg: string, data?: Json) => write('warn',  msg, data),
    error: (msg: string, data?: Json) => write('error', msg, data),
  };
}
