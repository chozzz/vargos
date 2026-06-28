import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Bus, Service, Json } from '../../core/types.js';
import { setLoggerBus, ts } from '../../lib/logger.js';
import { getDataPaths } from '../../lib/paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogPayload { level: LogLevel; service: string; message: string; data?: Json }
interface LogEntry { ts: string; level: LogLevel; service: string; message: string; data?: unknown }

export class LogService implements Service {
  readonly name = 'log';
  private logFile: string | null = null;
  private currentDate = '';

  init(bus: Bus): void {
    bus.on('log.onLog', (p: LogPayload) => this.onLog(p));
    setLoggerBus(bus);

    bus.register('log.search', {
      description: 'Search persisted log entries by level and/or service.',
      schema: z.object({
        sinceMs: z.number().optional().describe('Only return entries newer than this many ms ago'),
        service: z.string().optional(),
        level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
      }),
      cli: { positional: ['service'] },
    }, (p) => this.search(p));
  }

  dispose(): void {}

  private onLog(payload: LogPayload): void {
    const { level, service, message, data } = payload;
    // Suppress debug lines unless LOG_LEVEL=debug is explicitly set.
    if (level === 'debug' && process.env.LOG_LEVEL !== 'debug') return;

    const line = `${ts()} [${service}] ${message}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`;

    if (level === 'debug') console.debug(line);
    else if (level === 'info') console.info(line);
    else if (level === 'warn') {
      console.warn(line);
      this.persist({ ts: new Date().toISOString(), level, service, message, data }).catch(() => {});
    } else if (level === 'error') {
      console.error(line);
      this.persist({ ts: new Date().toISOString(), level, service, message, data }).catch(() => {});
    }
  }

  private async search(params: { sinceMs?: number; service?: string; level?: LogLevel }) {
    const file = this.todayFile();
    let raw: string;
    try { raw = await fs.readFile(file, 'utf-8'); }
    catch { return []; }

    const cutoff = params.sinceMs ? new Date(Date.now() - params.sinceMs).toISOString() : undefined;
    const entries: Array<{ service: string; error: string; context?: unknown; timestamp: number }> = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as LogEntry;
        if (cutoff && entry.ts < cutoff) continue;
        if (params.level && entry.level !== params.level) continue;
        if (params.service && entry.service !== params.service) continue;
        entries.push({ service: entry.service, error: entry.message, context: entry.data, timestamp: new Date(entry.ts).getTime() });
      } catch { /* skip */ }
    }
    return entries;
  }

  private todayFile(): string {
    const date = new Date().toISOString().slice(0, 10);
    if (date !== this.currentDate) {
      this.currentDate = date;
      this.logFile = path.join(getDataPaths().logsDir, `logs-${date}.jsonl`);
    }
    return this.logFile!;
  }

  private async persist(entry: LogEntry): Promise<void> {
    const file = this.todayFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, JSON.stringify(entry) + '\n');
  }
}

export function createService(): Service {
  return new LogService();
}
