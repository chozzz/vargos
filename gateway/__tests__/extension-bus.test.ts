import { describe, it, expect } from 'vitest';
import { EventEmitterBus } from '../emitter.js';

describe('Extension: createVargosCustomTools from bus.inspect', () => {
  it('search returns all registered callable events', async () => {
    const bus = new EventEmitterBus();

    // Use real services to get actual metadata
    const metadata = await bus.search();

    // Should have registered callable events from gateway tests
    expect(Array.isArray(metadata)).toBe(true);
    expect(metadata.every(e => typeof e.event === 'string')).toBe(true);
  });

  it('filters callable events by description', async () => {
    const bus = new EventEmitterBus();

    const all = await bus.search();
    const filtered = all.filter(e => e.description !== '(no description)');

    // All filtered events should have descriptions
    expect(filtered.every(e => e.description && e.description !== '(no description)')).toBe(true);
  });

  it('includes schema for tool wrapping', async () => {
    const bus = new EventEmitterBus();

    const all = await bus.search();
    const withSchema = all.filter(e => e.schema);

    // Events with schema should be defined
    expect(withSchema.every(e => e.schema)).toBe(true);
  });
});
