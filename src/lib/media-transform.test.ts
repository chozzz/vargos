import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile, writeFile, unlink, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { MediaAttachment } from './media-transform.js';
import type { ModelProfile } from '../config/pi-config.js';

// Save real fetch before mocking
const realFetch = globalThis.fetch;
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Dynamic import so the module picks up the mocked fetch
const { transformMedia } = await import('./media-transform.js');

function audioMedia(overrides?: Partial<MediaAttachment>): MediaAttachment {
  return {
    type: 'audio',
    data: Buffer.from('fake-audio').toString('base64'),
    mimeType: 'audio/ogg',
    path: '',
    ...overrides,
  };
}

function imageMedia(overrides?: Partial<MediaAttachment>): MediaAttachment {
  return {
    type: 'image',
    data: Buffer.from('fake-image').toString('base64'),
    mimeType: 'image/jpeg',
    path: '/tmp/image.jpg',
    ...overrides,
  };
}

function openaiProfile(overrides?: Partial<ModelProfile>): ModelProfile {
  return { provider: 'openai', model: 'whisper-1', apiKey: 'sk-test', ...overrides };
}

function anthropicProfile(overrides?: Partial<ModelProfile>): ModelProfile {
  return { provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'sk-test', ...overrides };
}

describe('transformMedia', () => {
  beforeEach(() => mockFetch.mockReset());

  it('transcribes audio via Whisper API (base64 fallback)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Hello world' }),
    });

    const result = await transformMedia(audioMedia(), openaiProfile());
    expect(result).toBe('Hello world');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer sk-test');
  });

  it('reads audio from saved file path when available', async () => {
    const tmpDir = path.join(os.tmpdir(), 'vargos-test-media');
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'voice_2026.ogg');
    await writeFile(tmpFile, Buffer.from('fake-ogg-audio'));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'From file' }),
    });

    try {
      const result = await transformMedia(audioMedia({ path: tmpFile }), openaiProfile());
      expect(result).toBe('From file');

      // Verify filename from path is used in FormData
      const [, opts] = mockFetch.mock.calls[0];
      const body = opts.body as FormData;
      const file = body.get('file') as File;
      expect(file.name).toBe('voice_2026.ogg');
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  });

  it('describes image via OpenAI Vision API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'A cat sitting on a mat' } }] }),
    });

    const result = await transformMedia(imageMedia(), openaiProfile({ model: 'gpt-4o-mini' }));
    expect(result).toBe('A cat sitting on a mat');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0].content[1].type).toBe('image_url');
  });

  it('describes image via Anthropic Vision API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'A dog in a park' }] }),
    });

    const result = await transformMedia(imageMedia(), anthropicProfile());
    expect(result).toBe('A dog in a park');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('sk-test');
  });

  it('throws for unsupported media type + provider combo', async () => {
    await expect(
      transformMedia(audioMedia(), anthropicProfile()),
    ).rejects.toThrow(/Unsupported media transform: audio \+ anthropic/);
  });

  it('throws for unknown media type', async () => {
    await expect(
      transformMedia({ ...audioMedia(), type: 'document' as any }, openaiProfile()),
    ).rejects.toThrow(/Unsupported media transform/);
  });

  it('throws on Whisper API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      transformMedia(audioMedia(), openaiProfile()),
    ).rejects.toThrow(/Whisper API 401/);
  });

  it('throws on OpenAI Vision API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });

    await expect(
      transformMedia(imageMedia(), openaiProfile({ model: 'gpt-4o-mini' })),
    ).rejects.toThrow(/OpenAI Vision API 500/);
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'test' }),
    });

    await transformMedia(audioMedia(), openaiProfile({ baseUrl: 'https://custom.api.com' }));
    expect(mockFetch.mock.calls[0][0]).toBe('https://custom.api.com/v1/audio/transcriptions');
  });
});

/**
 * Integration test — hits real Whisper API with a real audio file.
 * Skips when config or audio file is missing.
 */
describe('transformMedia integration', () => {
  const AUDIO_FILE = path.join(os.homedir(), '.vargos/media/whatsapp-61423222658/2026-02-22_043456_cb13.bin');
  const CONFIG_PATH = path.join(os.homedir(), '.vargos/config.json');

  let audioBuffer: Buffer;
  let whisperProfile: ModelProfile;
  let available = false;

  beforeEach(async () => {
    // Restore real fetch for integration tests
    vi.stubGlobal('fetch', realFetch);

    try {
      await access(AUDIO_FILE);
      await access(CONFIG_PATH);
      audioBuffer = await readFile(AUDIO_FILE);
      const config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
      const profileName = config.agent?.media?.audio;
      if (!profileName || !config.models?.[profileName]) return;
      whisperProfile = config.models[profileName];
      available = true;
    } catch {
      available = false;
    }
  });

  it('transcribes real audio via Whisper API', async () => {
    if (!available) {
      console.log('SKIP: missing config or audio file for Whisper integration test');
      return;
    }

    const media: MediaAttachment = {
      type: 'audio',
      data: audioBuffer.toString('base64'),
      mimeType: 'audio/ogg',
      path: AUDIO_FILE,
    };

    const result = await transformMedia(media, whisperProfile);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    console.log(`Whisper transcription: "${result}"`);
  }, 30_000);
});
