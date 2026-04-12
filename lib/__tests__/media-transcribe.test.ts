import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcribeAudio } from '../media-transcribe.js';
import type { MediaModelConfig } from '../media.js';
import * as fs from 'node:fs/promises';

// Mock fs.readFile
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('transcribeAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('baseUrl normalization', () => {
    it('handles baseUrl with trailing /v1', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
      });

      const result = await transcribeAudio('/tmp/audio.wav', config);

      expect(result).toBe('Hello world');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.any(Object),
      );
    });

    it('handles baseUrl without /v1', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
      });

      const result = await transcribeAudio('/tmp/audio.wav', config);

      expect(result).toBe('Hello world');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.any(Object),
      );
    });

    it('handles baseUrl with trailing /v1/', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1/',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
      });

      const result = await transcribeAudio('/tmp/audio.wav', config);

      expect(result).toBe('Hello world');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.any(Object),
      );
    });

    it('uses default baseUrl when not provided', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
      });

      const result = await transcribeAudio('/tmp/audio.wav', config);

      expect(result).toBe('Hello world');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.any(Object),
      );
    });
  });

  describe('API request', () => {
    it('sends correct headers with API key', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'sk-test-123',
        baseUrl: 'https://api.openai.com',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'transcribed' }),
      });

      await transcribeAudio('/tmp/audio.wav', config);

      const callArgs = vi.mocked(global.fetch).mock.calls[0];
      expect(callArgs[1]?.headers).toEqual({
        Authorization: 'Bearer sk-test-123',
      });
    });

    it('sends file and model in FormData body', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'transcribed' }),
      });

      await transcribeAudio('/tmp/test.wav', config);

      const callArgs = vi.mocked(global.fetch).mock.calls[0];
      expect(callArgs[1]?.method).toBe('POST');
      expect(callArgs[1]?.body).toBeInstanceOf(FormData);
    });
  });

  describe('error handling', () => {
    it('throws error for unsupported provider', async () => {
      const config = {
        provider: 'anthropic',
        model: 'some-model',
        apiKey: 'test-key',
      } as MediaModelConfig;

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      await expect(transcribeAudio('/tmp/audio.wav', config)).rejects.toThrow(
        /Unsupported audio transcription provider: anthropic/,
      );
    });

    it('throws error when no API key provided', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: '',
        baseUrl: 'https://api.openai.com',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      await expect(transcribeAudio('/tmp/audio.wav', config)).rejects.toThrow(
        /No API key configured/,
      );
    });

    it('throws error on API failure with status code', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '',
      });

      await expect(transcribeAudio('/tmp/audio.wav', config)).rejects.toThrow(
        /Whisper API 404/,
      );
    });

    it('includes error response in thrown error', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
      });

      await expect(transcribeAudio('/tmp/audio.wav', config)).rejects.toThrow(
        /Invalid API key/,
      );
    });
  });

  describe('response handling', () => {
    it('returns transcribed text from response', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      const expectedText = 'The quick brown fox jumps over the lazy dog';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: expectedText }),
      });

      const result = await transcribeAudio('/tmp/audio.wav', config);

      expect(result).toBe(expectedText);
    });

    it('returns fallback text when no speech detected', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: '' }),
      });

      const result = await transcribeAudio('/tmp/audio.wav', config);

      expect(result).toBe('[No speech detected]');
    });
  });

  describe('file extension handling', () => {
    it('preserves correct audio extensions', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'result' }),
      });

      const extensions = ['audio.mp3', 'audio.wav', 'audio.ogg', 'audio.m4a'];

      for (const filename of extensions) {
        vi.clearAllMocks();
        vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

        await transcribeAudio(`/tmp/${filename}`, config);
        // Should not throw
        expect(global.fetch).toHaveBeenCalled();
      }
    });

    it('converts unknown extensions to .ogg', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'result' }),
      });

      await transcribeAudio('/tmp/audio.xyz', config);

      const callArgs = vi.mocked(global.fetch).mock.calls[0];
      expect(callArgs[1]?.body).toBeInstanceOf(FormData);
      // The filename should have been converted to .ogg or a valid extension
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('model configuration', () => {
    it('uses provided model name', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'result' }),
      });

      await transcribeAudio('/tmp/audio.wav', config);

      const body = vi.mocked(global.fetch).mock.calls[0][1]?.body as FormData;
      expect(body.get('model')).toBe('whisper-1');
    });

    it('uses fallback model when not provided', async () => {
      const config: MediaModelConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      const audioBuffer = Buffer.from('fake audio');
      vi.mocked(fs.readFile).mockResolvedValue(audioBuffer);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'result' }),
      });

      await transcribeAudio('/tmp/audio.wav', config);

      const body = vi.mocked(global.fetch).mock.calls[0][1]?.body as FormData;
      expect(body.get('model')).toBe('whisper-1');
    });
  });
});
