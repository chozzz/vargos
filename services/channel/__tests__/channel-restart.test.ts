import { describe, it, expect, vi } from 'vitest';
import type { ChannelAdapter } from '../types.js';

/**
 * Logic extracted from ChannelService.restart() for isolated testing.
 * Mirrors the private method exactly — if that method changes, update this too.
 */
async function restart(
  adapters: Map<string, Pick<ChannelAdapter, 'stop' | 'start'>>,
  params: { id: string },
): Promise<{ restarted: boolean; id: string }> {
  const adapter = adapters.get(params.id);
  if (!adapter) throw new Error(`No adapter for channel: ${params.id}`);
  await adapter.stop();
  await adapter.start();
  return { restarted: true, id: params.id };
}

function makeAdapter(): Pick<ChannelAdapter, 'stop' | 'start'> & { callOrder: string[] } {
  const callOrder: string[] = [];
  return {
    callOrder,
    stop: vi.fn(async () => { callOrder.push('stop'); }),
    start: vi.fn(async () => { callOrder.push('start'); }),
  };
}

describe('channel.restart', () => {
  it('calls stop() then start() in order', async () => {
    const adapter = makeAdapter();
    const adapters = new Map([['wa-test', adapter]]);

    await restart(adapters, { id: 'wa-test' });

    expect(adapter.callOrder).toEqual(['stop', 'start']);
  });

  it('returns { restarted: true, id }', async () => {
    const adapters = new Map([['wa-test', makeAdapter()]]);

    const result = await restart(adapters, { id: 'wa-test' });

    expect(result).toEqual({ restarted: true, id: 'wa-test' });
  });

  it('throws when adapter not found', async () => {
    const adapters = new Map<string, Pick<ChannelAdapter, 'stop' | 'start'>>();

    await expect(restart(adapters, { id: 'missing' })).rejects.toThrow('No adapter for channel: missing');
  });

  it('propagates start() errors', async () => {
    const adapter = makeAdapter();
    vi.mocked(adapter.start).mockRejectedValueOnce(new Error('auth failed'));
    const adapters = new Map([['wa-test', adapter]]);

    await expect(restart(adapters, { id: 'wa-test' })).rejects.toThrow('auth failed');
    // stop() must still have been called before the error
    expect(adapter.callOrder).toContain('stop');
  });
});
