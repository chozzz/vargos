/**
 * Shared test harness for channel adapter tests
 * Usage:
 *   import { AdapterTestHarness, setupAdapterMocks } from '../test-utils/harness.js';
 *   setupAdapterMocks(); // at module level — vi.mock() calls are hoisted
 *   const harness = new AdapterTestHarness();
 *   beforeEach(() => harness.reset());
 */

import { vi } from 'vitest';
import type { OnInboundMessageFn } from '../types.js';

/** vi.mock() calls must live at module level (hoisted by vitest). Callers invoke this
 *  at the top of their test file to register the shared mocks in one call. */
export function setupAdapterMocks(): void {
  vi.mock('../../lib/media.js', () => ({
    saveMedia: vi.fn(async () => '/tmp/saved-media.jpg'),
  }));

  vi.mock('../delivery.js', () => ({
    deliverReply: vi.fn(async () => {}),
  }));
}

/** Runtime state and helpers shared across adapter test files */
export class AdapterTestHarness {
  readonly inboundCalls: Array<{
    channel: string;
    userId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }> = [];

  readonly mockOnInbound: OnInboundMessageFn;

  constructor() {
    this.mockOnInbound = vi.fn(async (channel, userId, content, metadata) => {
      this.inboundCalls.push({ channel, userId, content, metadata });
    });
  }

  reset(): void {
    vi.clearAllMocks();
    this.inboundCalls.length = 0;
  }
}

/** Build a mock FetchLike JSON response (Telegram API shape) */
export function tgResponse<T>(result: T) {
  return {
    ok: true as const,
    status: 200,
    statusText: 'OK',
    json: async () => ({ ok: true, result }),
    buffer: async () => Buffer.from(JSON.stringify({ ok: true, result })),
  };
}

/** Build a mock FetchLike binary response (file downloads) */
export function binaryResponse(data: Buffer) {
  return {
    ok: true as const,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    buffer: async () => data,
  };
}
