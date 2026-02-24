/**
 * Extract media file paths from agent text responses.
 * Detects absolute paths ending in known media extensions and verifies they exist on disk.
 */

import { accessSync } from 'node:fs';
import path from 'node:path';

const MEDIA_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.mp3', '.ogg', '.m4a',
  '.pdf',
]);

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
};

const PATH_RE = /(?:^|[\s\[(`])(\/{1}[\w./-]+\.(?:jpe?g|png|gif|webp|mp4|mp3|ogg|m4a|pdf))\b/gi;

export interface ExtractedMedia {
  filePath: string;
  mimeType: string;
}

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

    results.push({ filePath, mimeType: EXT_MIME[ext] || 'application/octet-stream' });
  }

  return results;
}
