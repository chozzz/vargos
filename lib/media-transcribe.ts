/**
 * Media transcription utilities
 * Transcribe audio to text using Whisper API
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaModelConfig } from './media.js';

const WHISPER_EXTS = new Set(['.flac', '.m4a', '.mp3', '.mp4', '.mpeg', '.mpga', '.oga', '.ogg', '.wav', '.webm']);

const MIME_TO_AUDIO_EXT: Record<string, string> = {
  'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a',
  'audio/wav': '.wav', 'audio/webm': '.webm', 'audio/flac': '.flac',
  'audio/x-m4a': '.m4a', 'audio/mp3': '.mp3',
};

/**
 * Transcribe audio file using Whisper API
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

  const apiBaseUrl = baseUrl ?? 'https://api.openai.com';
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
