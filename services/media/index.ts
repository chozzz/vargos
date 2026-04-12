/**
 * Media service — audio transcription and media processing
 *
 * Callable: media.transcribeAudio
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getDataPaths } from '../../lib/paths.js';
import { transcribeAudio } from '../../lib/media-transcribe.js';

const log = createLogger('media');

export class MediaService {
  private agentDir: string;

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {
    this.agentDir = path.join(getDataPaths().dataDir, 'agent');
  }

  @register('media.transcribeAudio', {
    description: 'Transcribe an audio file to text using configured audio model.',
    schema: z.object({ filePath: z.string() }),
  })
  async transcribeAudio(params: EventMap['media.transcribeAudio']['params']): Promise<EventMap['media.transcribeAudio']['result']> {
    const audioRef = this.config.agent?.media?.audio;
    if (!audioRef) throw new Error('No audio model configured (agent.media.audio)');

    const [provider, model] = audioRef.split(':');
    if (!provider || !model) throw new Error('Invalid audio config format (expected "provider:model")');

    const providerConfig = await this.resolveProviderConfig(provider);
    if (!providerConfig) throw new Error(`Provider config not found: ${provider}`);

    const text = await transcribeAudio(params.filePath, {
      provider,
      model,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
    });

    return { text };
  }

  /**
   * Resolve provider config from Pi Agent's models.json
   */
  private async resolveProviderConfig(provider: string): Promise<{ baseUrl?: string; apiKey?: string; api?: string } | null> {
    try {
      const modelsPath = path.join(this.agentDir, 'models.json');
      const content = await fs.readFile(modelsPath, 'utf-8');
      const models = JSON.parse(content);

      const providers = models.providers || {};
      const providerConfig = providers[provider];
      if (!providerConfig) return null;

      return {
        baseUrl: providerConfig.baseUrl,
        apiKey: providerConfig.apiKey,
        api: providerConfig.api,
      };
    } catch {
      return null;
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const config = await bus.call('config.get', {});
  const svc = new MediaService(bus, config);
  bus.bootstrap(svc);
  log.debug('media service initialized');
  return {};
}
