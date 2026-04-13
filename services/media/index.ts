/**
 * Media service — audio transcription and image description via provider abstraction
 *
 * Callable: media.transcribeAudio, media.transcribeImage
 */

import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { createProvider } from './providers/index.js';
import type { MediaProvider } from './providers/index.js';

const log = createLogger('media');

export class MediaService {
  private provider?: MediaProvider;

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {
    this.initProvider();
  }

  private initProvider(): void {
    const audioRef = this.config.agent?.media?.audio;
    if (!audioRef) return;

    const [provider] = audioRef.split(':');
    if (provider) {
      try {
        this.provider = createProvider(provider);
      } catch (err) {
        log.error('Failed to initialize provider', { provider, error: err instanceof Error ? err.message : String(err) });
      }
    }
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

    const apiKey = this.config.auth?.[provider]?.key;
    if (!apiKey) throw new Error(`No API key configured for ${provider}`);

    const baseUrl = this.config.providers?.[provider]?.baseUrl;
    const text = await this.provider!.transcribeAudio(params.filePath, model, apiKey, baseUrl);
    return { text };
  }

  @register('media.transcribeImage', {
    description: 'Describe an image using configured vision model.',
    schema: z.object({ imageData: z.string(), mimeType: z.string() }),
  })
  async transcribeImage(params: EventMap['media.transcribeImage']['params']): Promise<EventMap['media.transcribeImage']['result']> {
    const imgRef = this.config.agent?.media?.image;
    if (!imgRef) throw new Error('No image model configured (agent.media.image)');

    const [provider, model] = imgRef.split(':');
    if (!provider || !model) throw new Error('Invalid image config format (expected "provider:model")');

    const apiKey = this.config.auth?.[provider]?.key;
    if (!apiKey) throw new Error(`No API key configured for ${provider}`);

    const baseUrl = this.config.providers?.[provider]?.baseUrl;
    const description = await createProvider(provider).describeImage(params.imageData, params.mimeType, model, apiKey, baseUrl);
    return { description };
  }
}

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const config = await bus.call('config.get', {});
  const svc = new MediaService(bus, config);
  bus.bootstrap(svc);
  log.debug('media service initialized');
  return {};
}
