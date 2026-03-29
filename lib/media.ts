import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModelProfile } from '../services/config/index.js';

export interface MediaAttachment {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string;      // base64
  mimeType: string;
  path: string;      // saved file path
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

const WHISPER_EXTS = new Set(['.flac', '.m4a', '.mp3', '.mp4', '.mpeg', '.mpga', '.oga', '.ogg', '.wav', '.webm']);

const MIME_TO_AUDIO_EXT: Record<string, string> = {
  'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
  'audio/wav': '.wav', 'audio/webm': '.webm', 'audio/flac': '.flac',
  'audio/x-m4a': '.m4a', 'audio/mp3': '.mp3',
};

async function transcribeWhisper(media: MediaAttachment, profile: ModelProfile & { apiKey?: string }): Promise<string> {
  const baseUrl = profile.baseUrl ?? 'https://api.openai.com';
  const buffer = media.path ? await readFile(media.path) : Buffer.from(media.data, 'base64');
  let fileName = media.path ? path.basename(media.path) : 'audio.ogg';
  const ext = path.extname(fileName).toLowerCase();
  if (!WHISPER_EXTS.has(ext)) {
    const correctExt = MIME_TO_AUDIO_EXT[media.mimeType] || '.ogg';
    fileName = fileName.replace(/\.[^.]+$/, correctExt) || `audio${correctExt}`;
  }
  const blob = new Blob([new Uint8Array(buffer)], { type: media.mimeType });
  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('model', profile.model);
  const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: 'POST', headers: { Authorization: `Bearer ${profile.apiKey}` }, body: form,
  });
  if (!res.ok) throw new Error(`Whisper API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return ((await res.json()) as { text: string }).text;
}

async function describeImageOpenAI(media: MediaAttachment, profile: ModelProfile & { apiKey?: string }): Promise<string> {
  const baseUrl = profile.baseUrl ?? 'https://api.openai.com';
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${profile.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: profile.model, max_tokens: 1024,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe this image concisely. Focus on what is shown, any text visible, and relevant details.' },
        { type: 'image_url', image_url: { url: `data:${media.mimeType};base64,${media.data}` } },
      ]}],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI Vision API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function describeImageAnthropic(media: MediaAttachment, profile: ModelProfile & { apiKey?: string }): Promise<string> {
  const baseUrl = profile.baseUrl ?? 'https://api.anthropic.com';
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': profile.apiKey!, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: profile.model, max_tokens: 1024,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: media.mimeType, data: media.data } },
        { type: 'text', text: 'Describe this image concisely.' },
      ]}],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic Vision API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return data.content.find(b => b.type === 'text')?.text ?? '';
}

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
