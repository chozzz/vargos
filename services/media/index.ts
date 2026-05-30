/**
 * Media service — audio transcription, image description, and document extraction
 *
 * Callable: media.transcribeAudio, media.describeImage, media.extractDocument
 */

import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { createProvider } from './providers/index.js';
import { extractDocument } from './providers/document.js';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const log = createLogger('media');

/**
 * File-based cache for media processing results.
 * Stores cache in {filePath}/{filename}.metadata.json — survives restarts.
 * Prevents duplicate API calls for the same file.
 */
interface MediaCacheEntry {
  transcribe?: string;
  describe?: string;
}

class MediaCache {
  private processing = new Map<string, Promise<string>>();

  private cachePath(filePath: string): string {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    return path.join(dir, `${base}.metadata.json`);
  }

  private readCache(filePath: string): MediaCacheEntry | null {
    try {
      const cacheFile = this.cachePath(filePath);
      const raw = readFileSync(cacheFile, 'utf-8');
      return JSON.parse(raw) as MediaCacheEntry;
    } catch {
      return null;
    }
  }

  private writeCache(filePath: string, entry: MediaCacheEntry): void {
    try {
      const cacheFile = this.cachePath(filePath);
      writeFileSync(cacheFile, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (err) {
      log.warn(`failed to write media cache for ${filePath}: ${err}`);
    }
  }

  async get<T extends 'transcribe' | 'describe'>(
    filePath: string,
    type: T,
    fetcher: () => Promise<string>,
  ): Promise<string> {
    // Check file-based cache (cached forever)
    const cached = this.readCache(filePath);
    if (cached?.[type]) {
      return cached[type]!;
    }

    // Dedup: if another caller is already processing this file, wait for them
    const existing = this.processing.get(filePath);
    if (existing) {
      log.debug(`media dedup: waiting for concurrent ${type} of ${filePath}`);
      return existing;
    }

    // Start processing
    const promise = fetcher().then(result => {
      // Update cache file (merge with existing entries)
      const existing = this.readCache(filePath) ?? {};
      this.writeCache(filePath, { ...existing, [type]: result });
      this.processing.delete(filePath);
      return result;
    }).catch(err => {
      this.processing.delete(filePath);
      throw err;
    });

    this.processing.set(filePath, promise);
    return promise;
  }
}

export class MediaService {
  private cache = new MediaCache();

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
    description: 'Transcribe an audio file to text using configured audio model. Results are cached for 24h.',
    schema: z.object({ filePath: z.string() }),
  })
  async transcribeAudio(params: EventMap['media.transcribeAudio']['params']): Promise<EventMap['media.transcribeAudio']['result']> {
    const audioRef = this.config.agent?.media?.audio;
    if (!audioRef) throw new Error('No audio model configured (agent.media.audio)');

    const { provider, model, apiKey, baseUrl } = this.resolveProviderConfig(audioRef);
    const text = await this.cache.get(params.filePath, 'transcribe', () =>
      createProvider(provider).transcribeAudio(params.filePath, model, apiKey, baseUrl),
    );
    return { text };
  }

  @register('media.describeImage', {
    description: 'Describe an image using configured vision model. Results are cached for 24h.',
    schema: z.object({ filePath: z.string() }),
  })
  async describeImage(params: EventMap['media.describeImage']['params']): Promise<EventMap['media.describeImage']['result']> {
    const imgRef = this.config.agent?.media?.image;
    if (!imgRef) throw new Error('No image model configured (agent.media.image)');

    const { provider, model, apiKey, baseUrl } = this.resolveProviderConfig(imgRef);
    const description = await this.cache.get(params.filePath, 'describe', () =>
      createProvider(provider).describeImage(params.filePath, model, apiKey, baseUrl),
    );
    return { description };
  }

  @register('media.extractDocument', {
    description: 'Extract text from documents (PDF, DOCX, XLSX, TXT, MD).',
    schema: z.object({ filePath: z.string(), mimeType: z.string() }),
  })
  async extractDocument(params: EventMap['media.extractDocument']['params']): Promise<EventMap['media.extractDocument']['result']> {
    return extractDocument(params.filePath, params.mimeType);
  }
}

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const config = await bus.call('config.get', {});
  const svc = new MediaService(bus, config);
  bus.bootstrap(svc);
  log.debug('media service initialized');
  return {};
}
