/**
 * Shared inbound media pipeline for channel adapters
 * Subclasses implement resolveMedia(); the pipeline handles save → base64 → format → route
 */

import { saveMedia } from '../../lib/media.js';
import { resolveMediaDir } from '../../config/paths.js';
import { BaseChannelAdapter } from './base-adapter.js';

export interface InboundMediaSource {
  buffer: Buffer;
  mimeType: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  duration?: number;
}

const TYPE_LABELS: Record<string, string> = {
  audio: 'Voice message',
  video: 'Video message',
  document: 'Document',
  sticker: 'Sticker',
};

export abstract class InboundMediaHandler extends BaseChannelAdapter {
  /** Platform-specific: acquire buffer, detect MIME, return media source */
  protected abstract resolveMedia(msg: unknown): Promise<InboundMediaSource | null>;

  /** Shared pipeline: save → base64 → format → route */
  protected async processInboundMedia(
    msg: unknown,
    userId: string,
    sessionKey: string,
    route: (text: string, metadata?: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    const source = await this.resolveMedia(msg);
    if (!source) return;

    const { buffer, mimeType, mediaType, caption, duration } = source;
    const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir: resolveMediaDir() });
    const base64 = buffer.toString('base64');
    const media = { type: mediaType, data: base64, mimeType, path: savedPath };

    if (mediaType === 'image') {
      const text = caption || 'User sent an image.';
      const images = [{ data: base64, mimeType }];
      await route(`${text}\n\n[Image saved: ${savedPath}]`, { images, media });
      return;
    }

    const label = TYPE_LABELS[mediaType] ?? 'Media';
    const durationSuffix = duration != null ? `, ${duration}s` : '';
    const fallbackCaption = caption || `[${label}${durationSuffix}]`;
    await route(`${fallbackCaption}\n\n[${label} saved: ${savedPath}]`, { media });
  }
}
