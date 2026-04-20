/**
 * Shared inbound media pipeline for channel adapters
 * Subclasses implement resolveMedia(); the pipeline handles save → base64 → format → transcribe (audio) → route
 */

import path from 'node:path';
import { saveMedia } from '../../lib/media.js';
import { getDataPaths } from '../../lib/paths.js';
import { BaseChannelAdapter } from './base-adapter.js';
import type { InboundMediaSource } from './types.js';

export const TYPE_LABELS: Record<string, string> = {
  audio: 'Voice message',
  video: 'Video message',
  document: 'Document',
  sticker: 'Sticker',
};

export abstract class InboundMediaHandler extends BaseChannelAdapter {
  protected abstract resolveMedia(msg: unknown): Promise<InboundMediaSource | null>;

  protected transcribeFn?: (filePath: string) => Promise<string>;
  protected describeFn?: (filePath: string) => Promise<string>;

  /** Set audio transcription function */
  setTranscribeFn(fn: (filePath: string) => Promise<string>): void {
    this.transcribeFn = fn;
  }

  /** Set image description function */
  setDescribeFn(fn: (filePath: string) => Promise<string>): void {
    this.describeFn = fn;
  }

  /**
   * Process inbound media message.
   * @param msg - Raw message from channel
   * @param userId - User ID
   * @param sessionKey - Session key (channel:userId)
   * @param route - Function to route text + metadata to agent
   */
  protected async processInboundMedia(
    msg: unknown,
    userId: string,
    sessionKey: string,
    route: (text: string, metadata?: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    const source = await this.resolveMedia(msg);
    if (!source) return;

    const { buffer, mimeType, mediaType, caption, duration } = source;
    const mediaDir = path.join(getDataPaths().dataDir, 'media');
    const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir });
    const base64 = buffer.toString('base64');
    const media = { type: mediaType, data: base64, mimeType, path: savedPath };

    if (mediaType === 'image') {
      if (this.describeFn) {
        try {
          const description = await this.describeFn(savedPath);
          await route(
            `${description}\n\n[Image described from: ${savedPath}]`,
            { media, description },
          );
          return;
        } catch (err) {
          this.log.warn(`Image description failed: ${err}. Falling back to caption.`);
        }
      }
      const text = caption || 'User sent an image.';
      const images = [{ data: base64, mimeType }];
      await route(`${text}\n\n[Image saved: ${savedPath}]`, { images, media });
      return;
    }

    if (mediaType === 'audio' && this.transcribeFn) {
      try {
        const transcription = await this.transcribeFn(savedPath);
        await route(
          `${transcription}\n\n[Audio transcribed from: ${savedPath}]`,
          { media, transcription },
        );
        return;
      } catch (err) {
        // Fall through to default handling if transcription fails
        this.log.warn(`Audio transcription failed: ${err}. Falling back to file path.`);
      }
    }

    // Default handling for audio (no transcription) or other media types
    const label = TYPE_LABELS[mediaType] ?? 'Media';
    const durationSuffix = duration != null ? `, ${duration}s` : '';
    const fallbackCaption = caption || `[${label}${durationSuffix}]`;
    await route(`${fallbackCaption}\n\n[${label} saved: ${savedPath}]`, { media });
  }
}
