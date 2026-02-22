/**
 * Media transform layer — preprocesses media into text
 * before passing to the primary agent model.
 *
 * Each media type + provider combo dispatches to a small function
 * that calls the appropriate API. Uses raw fetch — no new deps.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModelProfile } from '../config/pi-config.js';

export interface MediaAttachment {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string;      // base64
  mimeType: string;
  path: string;       // saved file path
}

export async function transformMedia(
  media: MediaAttachment,
  profile: ModelProfile & { apiKey?: string },
): Promise<string> {
  const { type } = media;
  const { provider } = profile;

  if (type === 'audio' && provider === 'openai') return transcribeWhisper(media, profile);
  if (type === 'image' && provider === 'openai') return describeImageOpenAI(media, profile);
  if (type === 'image' && provider === 'anthropic') return describeImageAnthropic(media, profile);

  throw new Error(
    `Unsupported media transform: ${type} + ${provider}. ` +
    `Configure a compatible model profile for agent.media.${type}.`,
  );
}

// Whisper only accepts these extensions
const WHISPER_EXTS = new Set(['.flac', '.m4a', '.mp3', '.mp4', '.mpeg', '.mpga', '.oga', '.ogg', '.wav', '.webm']);

const MIME_TO_EXT: Record<string, string> = {
  'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
  'audio/wav': '.wav', 'audio/webm': '.webm', 'audio/flac': '.flac',
  'audio/x-m4a': '.m4a', 'audio/mp3': '.mp3',
};

/** OpenAI Whisper — /v1/audio/transcriptions */
async function transcribeWhisper(
  media: MediaAttachment,
  profile: ModelProfile,
): Promise<string> {
  const baseUrl = profile.baseUrl ?? 'https://api.openai.com';
  const url = `${baseUrl}/v1/audio/transcriptions`;

  // Read from saved file when available, fall back to base64
  const buffer = media.path
    ? await readFile(media.path)
    : Buffer.from(media.data, 'base64');

  // Whisper rejects unrecognized extensions — ensure the filename has a valid one
  let fileName = media.path ? path.basename(media.path) : 'audio.ogg';
  const ext = path.extname(fileName).toLowerCase();
  if (!WHISPER_EXTS.has(ext)) {
    const correctExt = MIME_TO_EXT[media.mimeType] || '.ogg';
    fileName = fileName.replace(/\.[^.]+$/, correctExt) || `audio${correctExt}`;
  }

  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes], { type: media.mimeType });

  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('model', profile.model);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${profile.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text: string };
  return data.text;
}

/** OpenAI Vision — /v1/chat/completions with image_url content */
async function describeImageOpenAI(
  media: MediaAttachment,
  profile: ModelProfile,
): Promise<string> {
  const baseUrl = profile.baseUrl ?? 'https://api.openai.com';
  const url = `${baseUrl}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: profile.model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image concisely. Focus on what is shown, any text visible, and relevant details.' },
          { type: 'image_url', image_url: { url: `data:${media.mimeType};base64,${media.data}` } },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI Vision API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

/** Anthropic Vision — /v1/messages with image content block */
async function describeImageAnthropic(
  media: MediaAttachment,
  profile: ModelProfile,
): Promise<string> {
  const baseUrl = profile.baseUrl ?? 'https://api.anthropic.com';
  const url = `${baseUrl}/v1/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': profile.apiKey!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: profile.model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media.mimeType, data: media.data } },
          { type: 'text', text: 'Describe this image concisely. Focus on what is shown, any text visible, and relevant details.' },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic Vision API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}
