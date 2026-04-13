/**
 * Media utilities — constants and helpers for file operations
 *
 * Transcription is implemented in MediaService via the media.transcribeAudio bus event.
 * Image vision APIs can be added to MediaService as needed.
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

/**
 * Get file extension for MIME type
 */
export function extFromMime(mimeType: string): string {
  return MIME_EXT[mimeType] || '.bin';
}

/**
 * Normalize API base URL by removing trailing /v1 (or /v1/)
 * Supports both formats: 'https://api.openai.com' and 'https://api.openai.com/v1'
 */
export function normalizeApiBaseUrl(baseUrl?: string): string {
  let url = baseUrl ?? 'https://api.openai.com';
  // Remove trailing /v1 or /v1/ if present
  url = url.replace(/\/v1\/?$/, '');
  return url;
}
