/**
 * Media transcription and vision utilities
 * - Whisper: audio → text (OpenAI)
 * - Vision: image description (OpenAI, Anthropic)
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaModelConfig } from './media.js';

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

/**
 * Transcribe audio file to text using Whisper API
 * @param filePath - Path to audio file
 * @param config - Model config (provider, model, apiKey, baseUrl)
 */
export async function transcribeAudio(
  filePath: string,
  config: MediaModelConfig,
): Promise<string> {
  const { provider, model, apiKey, baseUrl } = config;

  if (provider !== 'openai') {
    throw new Error(`Unsupported audio transcription provider: ${provider}. Only 'openai' is supported.`);
  }

  const buffer = await readFile(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();

  // Fix file extension if needed
  let finalFileName = fileName;
  if (!WHISPER_EXTS.has(ext)) {
    const correctExt = MIME_TO_AUDIO_EXT[ext] || '.ogg';
    finalFileName = fileName.replace(/\.[^.]+$/, correctExt) || `audio${correctExt}`;
  }

  const blob = new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' });
  const form = new FormData();
  form.append('file', blob, finalFileName);
  form.append('model', model || 'whisper-1');

  const apiBaseUrl = normalizeApiBaseUrl(baseUrl);

  if (!apiKey) {
    throw new Error(`No API key configured for OpenAI audio transcription`);
  }

  const res = await fetch(`${apiBaseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Whisper API ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text: string };
  return data.text || '[No speech detected]';
}

/**
 * Describe image using OpenAI Vision API
 */
export async function describeImageOpenAI(
  imageData: string,
  mimeType: string,
  config: MediaModelConfig,
): Promise<string> {
  const { apiKey, baseUrl, model } = config;

  if (!apiKey) {
    throw new Error('No API key configured for OpenAI image description');
  }

  const apiBaseUrl = normalizeApiBaseUrl(baseUrl);
  const res = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image concisely. Focus on what is shown, any text visible, and relevant details.' },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageData}` } },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`OpenAI Vision API ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

/**
 * Describe image using Anthropic Vision API
 */
export async function describeImageAnthropic(
  imageData: string,
  mimeType: string,
  config: MediaModelConfig,
): Promise<string> {
  const { apiKey, baseUrl, model } = config;

  if (!apiKey) {
    throw new Error('No API key configured for Anthropic image description');
  }

  const apiBaseUrl = baseUrl ?? 'https://api.anthropic.com';
  const res = await fetch(`${apiBaseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageData } },
          { type: 'text', text: 'Describe this image concisely.' },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Anthropic Vision API ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return data.content.find(b => b.type === 'text')?.text ?? '';
}
