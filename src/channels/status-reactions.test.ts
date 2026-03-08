import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusReactionController } from './status-reactions.js';
import type { ReactionAdapter } from './status-reactions.js';

function makeAdapter(): { react: ReturnType<typeof vi.fn>; adapter: ReactionAdapter } {
  const react = vi.fn().mockResolvedValue(undefined);
  return { react, adapter: { react } };
}

describe('StatusReactionController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls react immediately for queued', async () => {
    const { react, adapter } = makeAdapter();
    const ctrl = new StatusReactionController(adapter, 'user1', 'msg1');
    ctrl.setQueued();
    await vi.runAllTimersAsync();
    expect(react).toHaveBeenCalledWith('user1', 'msg1', '👀');
  });

  it('debounces rapid setThinking calls — only one react fires', async () => {
    const { react, adapter } = makeAdapter();
    const ctrl = new StatusReactionController(adapter, 'user1', 'msg1');

    ctrl.setThinking();
    ctrl.setThinking();
    ctrl.setThinking();

    // Before debounce window — no calls yet
    expect(react).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(react).toHaveBeenCalledTimes(1);
    expect(react).toHaveBeenCalledWith('user1', 'msg1', '🤔');

    ctrl.dispose();
  });

  it('debounces rapid setTool calls — only one react fires', async () => {
    const { react, adapter } = makeAdapter();
    const ctrl = new StatusReactionController(adapter, 'user1', 'msg1');

    ctrl.setTool('fs_read');
    ctrl.setTool('fs_write');
    ctrl.setTool('web_fetch');

    await vi.runAllTimersAsync();
    expect(react).toHaveBeenCalledTimes(1);
    expect(react).toHaveBeenCalledWith('user1', 'msg1', '🔧');

    ctrl.dispose();
  });

  it('setDone is immediate and seals the controller', async () => {
    const { react, adapter } = makeAdapter();
    const ctrl = new StatusReactionController(adapter, 'user1', 'msg1');

    ctrl.setDone();
    // Further calls are ignored
    ctrl.setThinking();
    ctrl.setTool('anything');

    await vi.runAllTimersAsync();
    expect(react).toHaveBeenCalledTimes(1);
    expect(react).toHaveBeenCalledWith('user1', 'msg1', '👍');

    ctrl.dispose();
  });

  it('setError is immediate and seals the controller', async () => {
    const { react, adapter } = makeAdapter();
    const ctrl = new StatusReactionController(adapter, 'user1', 'msg1');

    ctrl.setError();
    ctrl.setDone(); // ignored after seal

    await vi.runAllTimersAsync();
    expect(react).toHaveBeenCalledTimes(1);
    expect(react).toHaveBeenCalledWith('user1', 'msg1', '❗');

    ctrl.dispose();
  });

  it('serializes multiple calls in order', async () => {
    const order: string[] = [];
    const adapter: ReactionAdapter = {
      react: vi.fn().mockImplementation((_r, _m, emoji: string) => {
        order.push(emoji);
        return Promise.resolve();
      }),
    };

    const ctrl = new StatusReactionController(adapter, 'user1', 'msg1');
    ctrl.setQueued();
    // Advance past debounce to flush the queued immediate call
    await vi.advanceTimersByTimeAsync(10);
    ctrl.setDone();
    await vi.runAllTimersAsync();

    expect(order).toEqual(['👀', '👍']);
    ctrl.dispose();
  });

  it('dispose cancels pending debounced update', async () => {
    const { react, adapter } = makeAdapter();
    const ctrl = new StatusReactionController(adapter, 'user1', 'msg1');

    ctrl.setThinking();
    ctrl.dispose();

    await vi.runAllTimersAsync();
    expect(react).not.toHaveBeenCalled();
  });

  it('immediate terminal cancels pending debounce', async () => {
    const { react, adapter } = makeAdapter();
    const ctrl = new StatusReactionController(adapter, 'user1', 'msg1');

    ctrl.setThinking(); // debounced, not fired yet
    ctrl.setDone();     // cancels debounce, fires done immediately

    await vi.runAllTimersAsync();
    // Only done should be called, not thinking
    expect(react).toHaveBeenCalledTimes(1);
    expect(react).toHaveBeenCalledWith('user1', 'msg1', '👍');

    ctrl.dispose();
  });
});
