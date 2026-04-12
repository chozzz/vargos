import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { on, register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, LogLevel } from '../../gateway/events.js';
import { setLoggerBus, ts } from '../../lib/logger.js';
import { getDataPaths } from '../../lib/paths.js';

interface LogEntry {
  ts:       string;
  level:    LogLevel;
  service:  string;
  message:  string;
  data?:    unknown;
}

export class LogService {
  private logFile: string | null = null;
  private currentDate = '';

  @on('log.onLog')
  onLog(payload: EventMap['log.onLog']): void {
    const { level, service, message, data } = payload;
    const line = `${ts()} [${service}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    console.error(line);

    if (level === 'warn' || level === 'error') {
      this.persist({ ts: new Date().toISOString(), level, service, message, data }).catch(() => {});
    }
  }

  @register('log.search', {
    description: 'Search persisted log entries by level and/or service.',
    schema: z.object({
      sinceMs:  z.number().optional().describe('Only return entries newer than this many ms ago'),
      service:  z.string().optional(),
      level:    z.enum(['debug', 'info', 'warn', 'error']).optional(),
    }),
  })
  async search(params: EventMap['log.search']['params']): Promise<EventMap['log.search']['result']> {
    const file = this.todayFile();
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf-8');
    } catch {
      return [];
    }

    const cutoff = params.sinceMs ? new Date(Date.now() - params.sinceMs).toISOString() : undefined;

    const entries = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as LogEntry;
        if (cutoff && entry.ts < cutoff) continue;
        if (params.level && entry.level !== params.level) continue;
        if (params.service && entry.service !== params.service) continue;
        entries.push({
          service:   entry.service,
          error:     entry.message,
          context:   entry.data as import('../../gateway/events.js').Json | undefined,
          timestamp: new Date(entry.ts).getTime(),
        });
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

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const svc = new LogService();
  bus.bootstrap(svc);
  setLoggerBus(bus);
  return {};
}
