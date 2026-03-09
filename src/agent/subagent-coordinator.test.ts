import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubagentCoordinator, CallFn, RunAgentFn, DeliverFn, NotifyFn } from './subagent-coordinator.js';
import type { PiAgentRunResult } from './runtime.js';

function makeResult(overrides: Partial<PiAgentRunResult> = {}): PiAgentRunResult {
  return { success: true, response: 'done', duration: 2000, ...overrides };
}

describe('SubagentCoordinator', () => {
  let call: CallFn;
  let runAgent: RunAgentFn;
  let deliver: DeliverFn;
  let deliverNotify: NotifyFn;
  let coordinator: SubagentCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();
    call = vi.fn();
    runAgent = vi.fn().mockResolvedValue(makeResult());
    deliver = vi.fn().mockResolvedValue(undefined);
    deliverNotify = vi.fn().mockResolvedValue(undefined);
    coordinator = new SubagentCoordinator(call, runAgent, deliver, deliverNotify);
  });

  afterEach(() => {
    coordinator.clearTimers();
    vi.useRealTimers();
  });

  it('announces result to parent session', async () => {
    (call as ReturnType<typeof vi.fn>).mockResolvedValue({
      metadata: { parentSessionKey: 'whatsapp:123' },
    });

    await coordinator.handleSubagentCompletion('whatsapp:123:subagent:abc', makeResult());

    expect(call).toHaveBeenCalledWith('sessions', 'session.addMessage', expect.objectContaining({
      sessionKey: 'whatsapp:123',
      role: 'system',
    }));
  });

  it('debounces re-triggers for the same parent', async () => {
    (call as ReturnType<typeof vi.fn>).mockResolvedValue({
      metadata: { parentSessionKey: 'whatsapp:123' },
    });

    await coordinator.handleSubagentCompletion('whatsapp:123:subagent:a', makeResult());
    await coordinator.handleSubagentCompletion('whatsapp:123:subagent:b', makeResult());

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(3500);

    // runAgent called once, not twice
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it('routes channel parent result via deliver callback', async () => {
    const callMock = call as ReturnType<typeof vi.fn>;
    // First call: session.get for child
    callMock.mockResolvedValueOnce({ metadata: { parentSessionKey: 'whatsapp:123' } });
    // Second call: session.addMessage (announce)
    callMock.mockResolvedValueOnce(undefined);
    // Third call: session.getMessages (buildRetriggerTask)
    callMock.mockResolvedValueOnce([{ role: 'user', content: 'do something' }]);

    await coordinator.handleSubagentCompletion('whatsapp:123:subagent:a', makeResult());
    await vi.advanceTimersByTimeAsync(3500);

    expect(deliver).toHaveBeenCalledWith('whatsapp', '123', expect.objectContaining({ success: true }));
  });

  it('routes cron parent result via deliverNotify callback', async () => {
    const callMock = call as ReturnType<typeof vi.fn>;
    // session.get for child
    callMock.mockResolvedValueOnce({ metadata: { parentSessionKey: 'cron:daily' } });
    // session.addMessage
    callMock.mockResolvedValueOnce(undefined);
    // session.getMessages
    callMock.mockResolvedValueOnce([]);
    // session.get for root (in routeParentResult)
    callMock.mockResolvedValueOnce({ metadata: { notify: ['whatsapp:456'] } });

    await coordinator.handleSubagentCompletion('cron:daily:subagent:a', makeResult());
    await vi.advanceTimersByTimeAsync(3500);

    expect(deliverNotify).toHaveBeenCalledWith(['whatsapp:456'], expect.objectContaining({ success: true }));
  });

  it('does nothing when child has no parent', async () => {
    (call as ReturnType<typeof vi.fn>).mockResolvedValue({ metadata: {} });

    await coordinator.handleSubagentCompletion('whatsapp:123:subagent:a', makeResult());
    await vi.advanceTimersByTimeAsync(5000);

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('clearTimers cancels pending re-triggers', async () => {
    (call as ReturnType<typeof vi.fn>).mockResolvedValue({
      metadata: { parentSessionKey: 'whatsapp:123' },
    });

    await coordinator.handleSubagentCompletion('whatsapp:123:subagent:a', makeResult());
    coordinator.clearTimers();
    await vi.advanceTimersByTimeAsync(5000);

    expect(runAgent).not.toHaveBeenCalled();
  });
});
