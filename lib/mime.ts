/**
 * MIME ↔ file-extension maps and helpers. Pure data — no I/O, no domain imports.
 */

// Supported audio extensions for Whisper API
export const WHISPER_EXTS = new Set(['.flac', '.m4a', '.mp3', '.mp4', '.mpeg', '.mpga', '.oga', '.ogg', '.wav', '.webm']);

// MIME type to audio extension mapping
export const MIME_TO_AUDIO_EXT: Record<string, string> = {
  'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
  'audio/wav': '.wav', 'audio/webm': '.webm', 'audio/flac': '.flac',
  'audio/x-m4a': '.m4a', 'audio/mp3': '.mp3',
};

// MIME type to file extension mapping (includes images and video)
export const MIME_EXT: Record<string, string> = {
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

// Media type to default MIME type mapping (for fallback when MIME is unknown)
export const MEDIA_TYPE_MIME_DEFAULTS: Record<string, string> = {
  image: 'image/jpeg',
  audio: 'audio/ogg',
  video: 'video/mp4',
  document: 'application/pdf',
};

// Extension to MIME type mapping (inverse of MIME_EXT, includes common variations)
export const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.md': 'text/markdown',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Get file extension for a MIME type. */
export function extFromMime(mimeType: string): string {
  return MIME_EXT[mimeType] || '.bin';
}

/** Get MIME type from a file extension. */
export function getMimeTypeFromExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] || 'image/jpeg';
}
