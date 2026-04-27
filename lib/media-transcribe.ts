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
};

// Typed MIME constants by media type
export const IMAGE_MIMES = {
  'image/jpeg': true,
  'image/png': true,
  'image/gif': true,
  'image/webp': true,
  'image/bmp': true,
  'image/svg+xml': true,
} as const;

export const AUDIO_MIMES = {
  'audio/ogg': true,
  'audio/mpeg': true,
  'audio/mp4': true,
  'audio/wav': true,
  'audio/webm': true,
  'audio/flac': true,
  'audio/x-m4a': true,
  'audio/mp3': true,
} as const;

export const VIDEO_MIMES = {
  'video/mp4': true,
} as const;

export const DOCUMENT_MIMES = {
  'application/pdf': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
} as const;

export type ImageMimeType = keyof typeof IMAGE_MIMES;
export type AudioMimeType = keyof typeof AUDIO_MIMES;
export type VideoMimeType = keyof typeof VIDEO_MIMES;
export type DocumentMimeType = keyof typeof DOCUMENT_MIMES;

/**
 * Get file extension for MIME type
 */
export function extFromMime(mimeType: string): string {
  return MIME_EXT[mimeType] || '.bin';
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] || 'image/jpeg';
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
