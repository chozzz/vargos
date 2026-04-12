import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extFromMime } from './media-transcribe.js';

export interface MediaModelConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
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
