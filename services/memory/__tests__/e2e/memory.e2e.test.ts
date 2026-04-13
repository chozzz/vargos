import { describe, it, expect } from 'vitest';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { MemoryService } from '../../index.js';

describe('MemoryService E2E', () => {
  it('registers with bus', async () => {
    const bus = new EventEmitterBus();
    const service = new MemoryService(bus);
    bus.bootstrap(service);

    // Verify the service registered its events
    const metadata = await bus.search();
    const memoryEvents = metadata.filter(m => m.event.startsWith('memory.'));

    expect(memoryEvents.length).toBeGreaterThan(0);
    expect(memoryEvents.some(m => m.event === 'memory.search')).toBe(true);
  });

  it('memory events are registered and callable', async () => {
    const bus = new EventEmitterBus();
    const service = new MemoryService(bus);
    bus.bootstrap(service);

    // Verify all memory callable events are registered
    const metadata = await bus.search();
    expect(metadata.some(m => m.event === 'memory.search')).toBe(true);
    expect(metadata.some(m => m.event === 'memory.read')).toBe(true);
    expect(metadata.some(m => m.event === 'memory.write')).toBe(true);
    expect(metadata.some(m => m.event === 'memory.stats')).toBe(true);
  });
});
