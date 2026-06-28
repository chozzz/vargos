import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WhatsAppSessionEvents } from '../../services/channel/providers/whatsapp/types.js';

vi.mock('qrcode-terminal', () => ({ default: { generate: vi.fn() } }));
vi.mock('../../lib/paths.js', () => ({
  getDataPaths: () => ({ channelsDir: '/tmp/test-channels', configFile: '/tmp/config.json' }),
}));
vi.mock('../../lib/util.js', () => ({ readJson: vi.fn(() => null), writeJson: vi.fn() }));
vi.mock('../../services/channel/providers/whatsapp/session.js', () => ({
  createWhatsAppSocket: vi.fn(),
}));

import qrcode from 'qrcode-terminal';
import { createWhatsAppSocket } from '../../services/channel/providers/whatsapp/session.js';
import { pairWhatsApp } from '../channels.js';

// Flush the dynamic-import + Promise executor + createWhatsAppSocket call microtask chain.
const flush = () => new Promise<void>(r => setTimeout(r, 0));

describe('pairWhatsApp', () => {
  let capturedEvents: WhatsAppSessionEvents[];

  beforeEach(() => {
    vi.clearAllMocks(); // reset call counts between tests
    capturedEvents = [];
    vi.mocked(createWhatsAppSocket).mockImplementation(async (_dir, events) => {
      capturedEvents.push(events as WhatsAppSessionEvents);
      return {} as never;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('resolves only after onCredsSaved fires following onConnected', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    const events = capturedEvents[0];
    events.onQR('qr-data');
    events.onConnected('TestUser');

    let resolved = false;
    promise.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false); // still pending — onCredsSaved not yet called

    events.onCredsSaved!();
    await expect(promise).resolves.toBeUndefined();
  });

  it('onCredsSaved before onConnected does not prematurely resolve', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    const events = capturedEvents[0];
    events.onCredsSaved!(); // fired without onConnected — should be ignored

    let resolved = false;
    let rejected = false;
    promise.then(() => { resolved = true; }).catch(() => { rejected = true; });
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(rejected).toBe(false);

    // Proper sequence — cleans up the pending promise
    events.onConnected('TestUser');
    events.onCredsSaved!();
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects with expired error when a second QR arrives', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    const events = capturedEvents[0];
    events.onQR('first-qr');
    events.onQR('rotated-qr'); // Baileys rotated — first was not scanned in time

    await expect(promise).rejects.toThrow(/expired/i);
  });

  it('renders QR only once — second QR triggers rejection, not re-render', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    const events = capturedEvents[0];
    events.onQR('first-qr');
    expect(vi.mocked(qrcode.generate)).toHaveBeenCalledTimes(1);

    events.onQR('rotated-qr'); // second QR → should reject, not call generate again
    expect(vi.mocked(qrcode.generate)).toHaveBeenCalledTimes(1);

    await promise.catch(() => {}); // consume rejection
  });

  it('restart_required triggers reconnect and resolves after second session onCredsSaved', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    const events1 = capturedEvents[0];
    events1.onQR('qr-data');
    // Baileys closes with restart_required right after scan — normal flow, triggers reconnect
    events1.onDisconnected('restart_required');

    // Second connect() runs synchronously inside the handler, capturedEvents[1] is immediately available
    expect(capturedEvents).toHaveLength(2);
    const events2 = capturedEvents[1];

    events2.onConnected('TestUser');
    events2.onCredsSaved!();

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects with logged_out message', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    capturedEvents[0].onDisconnected('logged_out');

    await expect(promise).rejects.toThrow(/logged out/i);
  });

  it('rejects with forbidden message', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    capturedEvents[0].onDisconnected('forbidden');

    await expect(promise).rejects.toThrow(/forbidden/i);
  });

  it('rejects with generic message for unknown disconnect reasons', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    capturedEvents[0].onDisconnected('closed:408');

    await expect(promise).rejects.toThrow(/closed:408/);
  });

  it('subsequent events after resolution are silently ignored (settled guard)', async () => {
    const promise = pairWhatsApp('wa-test');
    await flush();

    const events = capturedEvents[0];
    events.onQR('qr-data');
    events.onConnected('TestUser');
    events.onCredsSaved!();

    await expect(promise).resolves.toBeUndefined();

    // Firing callbacks on an already-settled promise must not throw
    expect(() => {
      events.onConnected('again');
      events.onCredsSaved!();
      events.onDisconnected('some-reason');
    }).not.toThrow();
  });
});
