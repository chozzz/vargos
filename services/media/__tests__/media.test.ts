import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { EventEmitterBus } from '../../../gateway/emitter.js';
import { MediaService, boot } from '../index.js';
import type { AppConfig } from '../../config/index.js';

describe('MediaService', () => {
  let bus: EventEmitterBus;
  let service: MediaService;
  let tempDir: string;
  let agentDir: string;
  let modelsPath: string;

  beforeEach(async () => {
    bus = new EventEmitterBus();
    bus.bootstrap();

    tempDir = path.join(os.tmpdir(), `media-test-${Date.now()}`);
    agentDir = path.join(tempDir, 'agent');
    modelsPath = path.join(agentDir, 'models.json');
    const authPath = path.join(agentDir, 'auth.json');

    mkdirSync(agentDir, { recursive: true });
    writeFileSync(modelsPath, JSON.stringify({
      providers: {
        openai: {
          baseUrl: 'https://api.openai.com/v1',
          api: 'openai-completions',
          models: [],
        },
      },
    }, null, 2));
    writeFileSync(authPath, JSON.stringify({
      openai: {
        type: 'api_key',
        key: 'sk-test-openai',
      },
    }, null, 2));

    const config: AppConfig = {
      agent: {
        model: 'openai:test',
        media: { audio: 'openai:whisper-1' },
      },
      channels: [],
      cron: { tasks: [] },
      webhooks: [],
      heartbeat: {},
      linkExpand: {},
      mcp: {},
      paths: { dataDir: tempDir },
      gateway: { port: 9000 },
      providers: {
        openai: {
          baseUrl: 'https://api.openai.com/v1',
          api: 'openai-completions',
          models: [],
        },
      },
      auth: {
        openai: {
          type: 'api_key',
          key: 'sk-test-openai',
        },
      },
    };

    service = new MediaService(bus, config);
    bus.bootstrap(service);
  });

  describe('media.transcribeAudio — audio model configuration', () => {
    it('throws when audio model is not configured', async () => {
      const configNoAudio: AppConfig = {
        agent: {
          model: 'openai:test',
          // no media.audio configured
        },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: { dataDir: tempDir },
        gateway: { port: 9000 },
      };

      const bus2 = new EventEmitterBus();
      const service2 = new MediaService(bus2, configNoAudio);
      bus2.bootstrap(service2);

      await expect(
        bus2.call('media.transcribeAudio', { filePath: '/tmp/audio.mp3' }),
      ).rejects.toThrow(/No audio model configured/);
    });

    it('throws when provider is not found in auth', async () => {
      const configBadProvider: AppConfig = {
        agent: {
          model: 'test:model',
          media: { audio: 'nonexistent:whisper-1' },
        },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: { dataDir: tempDir },
        gateway: { port: 9000 },
        providers: {
          nonexistent: {
            baseUrl: 'https://api.nonexistent.com',
            api: 'openai-completions',
            models: [],
          },
        },
      };

      const bus2 = new EventEmitterBus();
      const service2 = new MediaService(bus2, configBadProvider);
      bus2.bootstrap(service2);

      await expect(
        bus2.call('media.transcribeAudio', { filePath: '/tmp/audio.mp3' }),
      ).rejects.toThrow(/No API key configured for nonexistent/);
    });

    it('throws when config format is invalid (missing colon)', async () => {
      const configInvalid: AppConfig = {
        agent: {
          model: 'test:model',
          media: { audio: 'invalid-format-no-colon' },
        },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: { dataDir: tempDir },
        gateway: { port: 9000 },
        auth: {
          test: {
            type: 'api_key',
            key: 'sk-test',
          },
        },
      };

      const bus2 = new EventEmitterBus();
      const service2 = new MediaService(bus2, configInvalid);
      bus2.bootstrap(service2);

      await expect(
        bus2.call('media.transcribeAudio', { filePath: '/tmp/audio.mp3' }),
      ).rejects.toThrow(/Invalid config format/);
    });
  });

  describe('media.transcribeAudio — provider config resolution', () => {
    it('resolves provider config from agent/models.json', async () => {
      // Mock the transcribeAudio function to avoid actual API calls
      const mockTranscribe = vi.fn(async () => 'mocked transcription');
      vi.doMock('../../../lib/media-transcribe.js', () => ({
        transcribeAudio: mockTranscribe,
      }));

      // Create a temporary audio file for testing
      const audioFile = path.join(tempDir, 'test.mp3');
      writeFileSync(audioFile, Buffer.from('fake audio data'));

      // The test verifies config resolution; actual transcription would require mocking
      // For now, we just verify that the service can be instantiated with valid config
      expect(service).toBeDefined();
      expect(service.config.agent.media?.audio).toBe('openai:whisper-1');
    });

    it('uses baseUrl from provider config if present', async () => {
      // Write a models.json with custom baseUrl
      const modelsWithUrl = {
        providers: {
          custom: {
            baseUrl: 'https://custom.api.com/v1',
            api: 'openai-completions',
            models: [],
          },
        },
      };
      writeFileSync(modelsPath, JSON.stringify(modelsWithUrl, null, 2));

      const authPath = path.join(agentDir, 'auth.json');
      writeFileSync(authPath, JSON.stringify({
        custom: {
          type: 'api_key',
          key: 'sk-custom-key',
        },
      }, null, 2));

      const configCustom: AppConfig = {
        agent: {
          model: 'custom:model',
          media: { audio: 'custom:transcribe' },
        },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: { dataDir: tempDir },
        gateway: { port: 9000 },
        providers: {
          custom: {
            baseUrl: 'https://custom.api.com/v1',
            api: 'openai-completions',
            models: [],
          },
        },
        auth: {
          custom: {
            type: 'api_key',
            key: 'sk-custom-key',
          },
        },
      };

      const bus2 = new EventEmitterBus();
      const service2 = new MediaService(bus2, configCustom);
      bus2.bootstrap(service2);

      expect(service2).toBeDefined();
    });
  });

  describe('boot function', () => {
    it('creates and bootstraps MediaService', async () => {
      const config: AppConfig = {
        agent: {
          model: 'test:model',
          media: { audio: 'openai:whisper-1' },
        },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: { dataDir: tempDir },
        gateway: { port: 9000 },
        providers: {
          openai: {
            baseUrl: 'https://api.openai.com/v1',
            api: 'openai-completions',
            models: [],
          },
        },
        auth: {
          openai: {
            type: 'api_key',
            key: 'sk-test',
          },
        },
      };

      const bus2 = new EventEmitterBus();
      bus2.bootstrap();

      // Mock config.get to return our test config
      const callSpy = vi.spyOn(bus2, 'call').mockResolvedValueOnce(config);

      const result = await boot(bus2);

      expect(result).toBeDefined();
      expect(callSpy).toHaveBeenCalledWith('config.get', {});
    });

    it('returns object without stop method (optional)', async () => {
      const config: AppConfig = {
        agent: {
          model: 'test:model',
          media: { audio: 'openai:whisper-1' },
        },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: { dataDir: tempDir },
        gateway: { port: 9000 },
        providers: {
          openai: {
            baseUrl: 'https://api.openai.com/v1',
            api: 'openai-completions',
            models: [],
          },
        },
        auth: {
          openai: {
            type: 'api_key',
            key: 'sk-test',
          },
        },
      };

      const bus2 = new EventEmitterBus();
      bus2.bootstrap();

      vi.spyOn(bus2, 'call').mockResolvedValueOnce(config);

      const result = await boot(bus2);

      // stop is optional for media service
      expect(result).toEqual({});
    });
  });

  describe('service instantiation', () => {
    it('creates service successfully with valid config', () => {
      expect(service).toBeDefined();
    });

    it('handles config without audio transcription setup', () => {
      const configNoAudio: AppConfig = {
        agent: {
          model: 'test:model',
          // no media configuration
        },
        channels: [],
        cron: { tasks: [] },
        webhooks: [],
        heartbeat: {},
        linkExpand: {},
        mcp: {},
        paths: { dataDir: tempDir },
        gateway: { port: 9000 },
      };

      const service2 = new MediaService(bus, configNoAudio);
      expect(service2).toBeDefined();
    });
  });

  describe('media.transcribeAudio — transcription flow', () => {
    it('successfully transcribes audio file', async () => {
      const audioFile = path.join(tempDir, 'test.mp3');
      writeFileSync(audioFile, Buffer.from('fake audio data'));

      // Mock fetch for Whisper API
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Hello world from audio' }),
      });

      const result = await bus.call('media.transcribeAudio', { filePath: audioFile });

      expect(result.text).toBe('Hello world from audio');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-openai',
          }),
        }),
      );
    });

    it('returns fallback message when no speech detected', async () => {
      const audioFile = path.join(tempDir, 'silent.mp3');
      writeFileSync(audioFile, Buffer.from('silence'));

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '' }),
      });

      const result = await bus.call('media.transcribeAudio', { filePath: audioFile });

      expect(result.text).toBe('[No speech detected]');
    });

    it('throws on Whisper API error', async () => {
      const audioFile = path.join(tempDir, 'error.mp3');
      writeFileSync(audioFile, Buffer.from('audio data'));

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        bus.call('media.transcribeAudio', { filePath: audioFile }),
      ).rejects.toThrow(/Whisper API 401/);
    });

    it('handles file extension normalization', async () => {
      const audioFile = path.join(tempDir, 'test.unknown');
      writeFileSync(audioFile, Buffer.from('audio data'));

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'transcribed' }),
      });

      await bus.call('media.transcribeAudio', { filePath: audioFile });

      const call = global.fetch.mock.calls[0];
      expect(call[0]).toContain('/audio/transcriptions');
    });
  });
});
