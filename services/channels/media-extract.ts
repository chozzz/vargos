/**
 * Extract media file paths from agent text responses.
 * Detects absolute paths ending in known media extensions and verifies they exist on disk.
 */

import { accessSync } from 'node:fs';
import path from 'node:path';
import type { ExtractedMedia } from './types.js';
import { EXT_TO_MIME } from '../../lib/media-transcribe.js';

const MEDIA_EXTS = new Set(Object.keys(EXT_TO_MIME));

const PATH_RE = /(?:^|[\s[(`)>])\.?(\/[\w./-]+\.(?:jpe?g|png|gif|webp|mp4|mp3|ogg|m4a|pdf))\b/gi;

export function extractMediaPaths(text: string): ExtractedMedia[] {
  const results: ExtractedMedia[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PATH_RE)) {
    const filePath = match[1];
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const ext = path.extname(filePath).toLowerCase();
    if (!MEDIA_EXTS.has(ext)) continue;

    try {
      accessSync(filePath);
    } catch {
      continue;
    }

    results.push({ filePath, mimeType: EXT_TO_MIME[ext] || 'application/octet-stream' });
  }

  return results;
}
