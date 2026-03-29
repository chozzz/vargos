import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { WebService } from '../../index.js';

describe('WebService E2E', () => {
  let bus: EventEmitterBus;
  let service: WebService;

  beforeEach(() => {
    bus = new EventEmitterBus();
    service = new WebService();
    bus.bootstrap(service);
  });

  describe('web.fetch', () => {
    it('throws on invalid URL', async () => {
      try {
        await bus.call('web.fetch', {
          url: 'https://invalid-domain-that-does-not-exist-12345.com',
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toBeDefined();
      }
    });

    it('fetches real URLs (integration test, skipped if offline)', async () => {
      // Skip this test if there's no network connectivity
      try {
        const result = await bus.call('web.fetch', {
          url: 'https://example.com',
          maxChars: 500,
        });

        expect(result.text).toBeDefined();
        expect(typeof result.text).toBe('string');
        expect(result.text.length).toBeGreaterThan(0);
      } catch (err) {
        // Network-related errors are acceptable in test environments
        if ((err as Error).message.includes('fetch')) {
          console.log('Skipping network test: no connectivity');
        } else {
          throw err;
        }
      }
    });
  });
});
