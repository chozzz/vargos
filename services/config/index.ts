import { z } from 'zod';
import { on } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, AppConfig } from '../../gateway/events.js';
import { AppConfigSchema, loadConfig, saveConfig } from '../../config/index.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';

export class ConfigService {
  private config:      AppConfig;
  private readonly log = createLogger('config');

  constructor(
    private readonly bus:  Bus,
    private readonly file: string,
  ) {
    this.config = loadConfig(file);
  }

  @on('config.get')
  async get(_params: EventMap['config.get']['params']): Promise<EventMap['config.get']['result']> {
    return this.config;
  }

  @on('config.set', {
    description: 'Update the application config. Validates, persists to disk, and broadcasts config.changed.',
    schema: z.object({}).passthrough(),
    format: () => 'Config updated.',
  })
  async set(params: EventMap['config.set']['params']): Promise<EventMap['config.set']['result']> {
    const parsed = AppConfigSchema.parse(params);
    this.config = parsed;
    saveConfig(this.file, parsed);
    this.bus.emit('config.changed', parsed);
    this.log.info('config updated and persisted');
    return parsed;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const svc = new ConfigService(bus, getDataPaths().configFile);
  bus.registerService(svc);
  return {};
}
