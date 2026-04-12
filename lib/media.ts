import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  transcribeAudio,
  describeImageOpenAI,
  describeImageAnthropic,
  extFromMime,
  MIME_TO_AUDIO_EXT,
} from './media-transcribe.js';

export interface MediaModelConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface MediaAttachment {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string;      // base64
  mimeType: string;
  path: string;      // saved file path
}

/**
 * Transform media (transcribe audio or describe image) based on provider
 */
export async function transformMedia(
  media: MediaAttachment,
  profile: MediaModelConfig,
): Promise<string> {
  const { type, data, mimeType, path: filePath } = media;
  const { provider } = profile;

  if (type === 'audio' && provider === 'openai') {
    // For audio, use file path if available, otherwise save temp buffer
    const audioPath = filePath || await saveTempFile(Buffer.from(data, 'base64'), mimeType);
    return transcribeAudio(audioPath, profile);
  }

  if (type === 'image' && provider === 'openai') {
    return describeImageOpenAI(data, mimeType, profile);
  }

  if (type === 'image' && provider === 'anthropic') {
    return describeImageAnthropic(data, mimeType, profile);
  }

  throw new Error(
    `Unsupported media transform: ${type} + ${provider}. ` +
    `Configure a compatible model profile for agent.media.${type}.`,
  );
}

/**
 * Save buffer to temp file with proper extension
 */
async function saveTempFile(buffer: Buffer, mimeType: string): Promise<string> {
  const ext = getMimeExt(mimeType);
  const tempPath = path.join('/tmp', `vargos-media-${Date.now()}${ext}`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

/**
 * Get file extension for MIME type
 */
function getMimeExt(mimeType: string): string {
  return MIME_TO_AUDIO_EXT[mimeType] || '.ogg';
}

export async function saveMedia(params: {
  buffer: Buffer;
  sessionKey: string;
  mimeType: string;
  mediaDir: string;
}): Promise<string> {
  const dir = path.join(params.mediaDir, params.sessionKey.replace(/:/g, '-'));
  await mkdir(dir, { recursive: true });

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const hash = createHash('sha256').update(params.buffer).digest('hex').slice(0, 4);
  const ext = extFromMime(params.mimeType);

  const filename = `${date}_${time}_${hash}${ext}`;
  const filepath = path.join(dir, filename);

  await writeFile(filepath, params.buffer);
  return filepath;
}
