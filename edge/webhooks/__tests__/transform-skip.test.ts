import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebhooksEdge } from '../index.js';

type Call = { method: string; params: unknown };

/** Instantiate the edge with a stubbed bus and expose the private fireHook. */
function stubEdge(calls: Call[]) {
  const edge = new WebhooksEdge() as unknown as {
    bus: { call: (m: string, p: unknown) => Promise<unknown> };
    fireHook: (hook: { id: string; name: string; transform?: string; notify?: string[] }, payload: unknown) => Promise<void>;
  };
  edge.bus = {
    call: vi.fn(async (method: string, params: unknown) => {
      calls.push({ method, params });
      return method === 'agent.execute' ? { response: 'done' } : {};
    }),
  };
  return edge;
}

describe('webhook transform — null/undefined skip', () => {
  let dataDir: string;

  beforeAll(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'webhooks-skip-'));
    process.env.VARGOS_DATA_DIR = dataDir;
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.VARGOS_DATA_DIR;
  });

  it('skips agent.execute and notify delivery when transform returns null', async () => {
    writeFileSync(path.join(dataDir, 'skip-null.js'), 'export default () => null;');
    const calls: Call[] = [];
    const edge = stubEdge(calls);
    await edge.fireHook({ id: 'skip-null', name: 'x', transform: 'skip-null.js' }, {});
    expect(calls).toHaveLength(0);
  });

  it('skips when transform returns undefined', async () => {
    writeFileSync(path.join(dataDir, 'skip-undef.js'), 'export default () => undefined;');
    const calls: Call[] = [];
    const edge = stubEdge(calls);
    await edge.fireHook({ id: 'skip-undef', name: 'x', transform: 'skip-undef.js' }, {});
    expect(calls).toHaveLength(0);
  });

  it('still executes and notifies when transform returns a string', async () => {
    writeFileSync(path.join(dataDir, 'keep.js'), 'export default () => "DO THE THING";');
    const calls: Call[] = [];
    const edge = stubEdge(calls);
    await edge.fireHook({ id: 'keep', name: 'x', transform: 'keep.js', notify: ['telegram:u1'] }, {});
    expect(calls.map(c => c.method)).toEqual(['agent.execute', 'channel.send']);
    expect(calls[0].params).toMatchObject({ task: 'DO THE THING' });
  });
});
