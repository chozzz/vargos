import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveMediaDir } from '../config/paths.js';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'video/mp4': '.mp4',
  'application/pdf': '.pdf',
};

function extFromMime(mimeType: string): string {
  return MIME_EXT[mimeType] || '.bin';
}

export async function saveMedia(params: {
  buffer: Buffer;
  sessionKey: string;
  mimeType: string;
}): Promise<string> {
  const dir = resolveMediaDir(params.sessionKey);
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
