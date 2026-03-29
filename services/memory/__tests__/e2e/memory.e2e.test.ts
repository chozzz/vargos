import { describe, it, expect } from 'vitest';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { MemoryService } from '../../index.js';

describe('MemoryService E2E', () => {
  it('registers with bus', async () => {
    const bus = new EventEmitterBus();
    const service = new MemoryService();
    bus.bootstrap(service);

    // Verify the service registered its events
    const metadata = await bus.search();
    const memoryEvents = metadata.filter(m => m.event.startsWith('memory.'));

    expect(memoryEvents.length).toBeGreaterThan(0);
    expect(memoryEvents.some(m => m.event === 'memory.search')).toBe(true);
  });

  it('throws on memory operations without initialized context', async () => {
    const bus = new EventEmitterBus();
    const service = new MemoryService();
    bus.bootstrap(service);

    try {
      await bus.call('memory.search', { query: 'test', maxResults: 10 });
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('MemoryContext not initialized');
    }
  });
});
