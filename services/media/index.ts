/**
 * Media service — audio transcription and image description via provider abstraction
 *
 * Callable: media.transcribeAudio, media.describeImage
 */

import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { createProvider } from './providers/index.js';

const log = createLogger('media');

export class MediaService {
  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {}


  private resolveProviderConfig(ref: string): { provider: string; model: string; apiKey: string; baseUrl?: string } {
    const [provider, model] = ref.split(':');
    if (!provider || !model) throw new Error('Invalid config format (expected "provider:model")');
    const authEntry = this.config.auth?.[provider];
    const apiKey = authEntry && 'key' in authEntry ? authEntry.key : null;
    if (!apiKey) throw new Error(`No API key configured for ${provider}`);
    return { provider, model, apiKey, baseUrl: this.config.providers?.[provider]?.baseUrl };
  }

  @register('media.transcribeAudio', {
    description: 'Transcribe an audio file to text using configured audio model.',
    schema: z.object({ filePath: z.string() }),
  })
  async transcribeAudio(params: EventMap['media.transcribeAudio']['params']): Promise<EventMap['media.transcribeAudio']['result']> {
    const audioRef = this.config.agent?.media?.audio;
    if (!audioRef) throw new Error('No audio model configured (agent.media.audio)');

    const { provider, model, apiKey, baseUrl } = this.resolveProviderConfig(audioRef);
    const text = await createProvider(provider).transcribeAudio(params.filePath, model, apiKey, baseUrl);
    return { text };
  }

  @register('media.describeImage', {
    description: 'Describe an image using configured vision model.',
    schema: z.object({ filePath: z.string() }),
  })
  async describeImage(params: EventMap['media.describeImage']['params']): Promise<EventMap['media.describeImage']['result']> {
    const imgRef = this.config.agent?.media?.image;
    if (!imgRef) throw new Error('No image model configured (agent.media.image)');

    const { provider, model, apiKey, baseUrl } = this.resolveProviderConfig(imgRef);
    const description = await createProvider(provider).describeImage(params.filePath, model, apiKey, baseUrl);
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
