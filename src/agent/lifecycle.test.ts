import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLifecycle } from './lifecycle.js';
import type {
  LifecycleEvent,
  AssistantStreamEvent,
  ToolStreamEvent,
  CompactionStreamEvent,
} from './lifecycle.js';

describe('AgentLifecycle', () => {
  let lc: AgentLifecycle;

  beforeEach(() => {
    lc = new AgentLifecycle();
  });

  // ---------- startRun ----------

  it('startRun registers run and emits start event', () => {
    const streamSpy = vi.fn();
    const startSpy = vi.fn();
    lc.on('stream', streamSpy);
    lc.on('start', startSpy);

    lc.startRun('r1', 'sess1');

    expect(lc.isRunning('r1')).toBe(true);
    expect(streamSpy).toHaveBeenCalledOnce();

    const event = streamSpy.mock.calls[0][0] as LifecycleEvent;
    expect(event.type).toBe('lifecycle');
    expect(event.phase).toBe('start');
    expect(event.runId).toBe('r1');
    expect(event.sessionKey).toBe('sess1');

    expect(startSpy).toHaveBeenCalledWith('r1', 'sess1');
  });

  // ---------- endRun ----------

  it('endRun removes run and emits end with duration', () => {
    lc.startRun('r1', 'sess1');

    const streamSpy = vi.fn();
    const endSpy = vi.fn();
    lc.on('stream', streamSpy);
    lc.on('end', endSpy);

    lc.endRun('r1');

    expect(lc.isRunning('r1')).toBe(false);

    const event = streamSpy.mock.calls[0][0] as LifecycleEvent;
    expect(event.phase).toBe('end');
    expect(event.duration).toBeGreaterThanOrEqual(0);

    expect(endSpy).toHaveBeenCalledWith('r1', {
      tokens: undefined,
      duration: expect.any(Number),
    });
  });

  it('endRun includes token counts when provided', () => {
    lc.startRun('r1', 'sess1');

    const streamSpy = vi.fn();
    lc.on('stream', streamSpy);

    const tokens = { input: 100, output: 50, total: 150 };
    lc.endRun('r1', tokens);

    const event = streamSpy.mock.calls[0][0] as LifecycleEvent;
    expect(event.tokens).toEqual(tokens);
  });

  it('endRun for unknown run is no-op', () => {
    const streamSpy = vi.fn();
    lc.on('stream', streamSpy);

    lc.endRun('nonexistent');
    expect(streamSpy).not.toHaveBeenCalled();
  });

  // ---------- errorRun ----------

  it('errorRun emits error event with string message', () => {
    lc.startRun('r1', 'sess1');

    const streamSpy = vi.fn();
    const errorSpy = vi.fn();
    lc.on('stream', streamSpy);
    lc.on('run_error', errorSpy);

    lc.errorRun('r1', 'something broke');

    expect(lc.isRunning('r1')).toBe(false);

    const event = streamSpy.mock.calls[0][0] as LifecycleEvent;
    expect(event.phase).toBe('error');
    expect(event.error).toBe('something broke');

    expect(errorSpy).toHaveBeenCalledWith('r1', 'something broke');
  });

  it('errorRun with Error object extracts message', () => {
    lc.startRun('r1', 'sess1');

    const streamSpy = vi.fn();
    lc.on('stream', streamSpy);

    lc.errorRun('r1', new Error('kaboom'));

    const event = streamSpy.mock.calls[0][0] as LifecycleEvent;
    expect(event.error).toBe('kaboom');
  });

  it('errorRun for unknown run is no-op', () => {
    const streamSpy = vi.fn();
    lc.on('stream', streamSpy);

    lc.errorRun('ghost', 'fail');
    expect(streamSpy).not.toHaveBeenCalled();
  });

  // ---------- abortRun ----------

  it('abortRun returns true for active run, false for unknown', () => {
    lc.startRun('r1', 'sess1');

    expect(lc.abortRun('r1')).toBe(true);
    expect(lc.abortRun('r1')).toBe(false);
  });

  it('abortRun triggers abort signal', () => {
    lc.startRun('r1', 'sess1');
    const signal = lc.getAbortSignal('r1')!;

    expect(signal.aborted).toBe(false);
    lc.abortRun('r1', 'user cancelled');
    expect(signal.aborted).toBe(true);
  });

  // ---------- isRunning ----------

  it('isRunning returns true for active, false for unknown', () => {
    expect(lc.isRunning('r1')).toBe(false);
    lc.startRun('r1', 'sess1');
    expect(lc.isRunning('r1')).toBe(true);
    lc.endRun('r1');
    expect(lc.isRunning('r1')).toBe(false);
  });

  // ---------- getAbortSignal ----------

  it('getAbortSignal returns signal for active run, undefined for unknown', () => {
    expect(lc.getAbortSignal('r1')).toBeUndefined();
    lc.startRun('r1', 'sess1');
    expect(lc.getAbortSignal('r1')).toBeInstanceOf(AbortSignal);
  });

  // ---------- streamAssistant ----------

  it('streamAssistant emits for active run', () => {
    lc.startRun('r1', 'sess1');

    const streamSpy = vi.fn();
    const assistSpy = vi.fn();
    lc.on('stream', streamSpy);
    lc.on('assistant', assistSpy);

    lc.streamAssistant('r1', 'hello', true);

    const event = streamSpy.mock.calls[0][0] as AssistantStreamEvent;
    expect(event.type).toBe('assistant');
    expect(event.content).toBe('hello');
    expect(event.isComplete).toBe(true);
    expect(event.sessionKey).toBe('sess1');

    expect(assistSpy).toHaveBeenCalledWith(event);
  });

  it('streamAssistant is silent for unknown run', () => {
    const spy = vi.fn();
    lc.on('stream', spy);

    lc.streamAssistant('ghost', 'hi');
    expect(spy).not.toHaveBeenCalled();
  });

  // ---------- streamTool ----------

  it('streamTool emits for active run', () => {
    lc.startRun('r1', 'sess1');

    const streamSpy = vi.fn();
    const toolSpy = vi.fn();
    lc.on('stream', streamSpy);
    lc.on('tool', toolSpy);

    lc.streamTool('r1', 'read_file', 'start', { path: '/tmp' });

    const event = streamSpy.mock.calls[0][0] as ToolStreamEvent;
    expect(event.type).toBe('tool');
    expect(event.toolName).toBe('read_file');
    expect(event.phase).toBe('start');
    expect(event.args).toEqual({ path: '/tmp' });

    expect(toolSpy).toHaveBeenCalledWith(event);
  });

  // ---------- streamCompaction ----------

  it('streamCompaction emits for active run', () => {
    lc.startRun('r1', 'sess1');

    const streamSpy = vi.fn();
    const compSpy = vi.fn();
    lc.on('stream', streamSpy);
    lc.on('compaction', compSpy);

    lc.streamCompaction('r1', 5000, 'Summarized context');

    const event = streamSpy.mock.calls[0][0] as CompactionStreamEvent;
    expect(event.type).toBe('compaction');
    expect(event.tokensBefore).toBe(5000);
    expect(event.summary).toBe('Summarized context');

    expect(compSpy).toHaveBeenCalledWith(event);
  });

  // ---------- listActiveRuns ----------

  it('listActiveRuns returns all with duration', () => {
    lc.startRun('r1', 'sess1');
    lc.startRun('r2', 'sess2');

    const runs = lc.listActiveRuns();
    expect(runs).toHaveLength(2);

    const ids = runs.map((r) => r.runId).sort();
    expect(ids).toEqual(['r1', 'r2']);

    for (const r of runs) {
      expect(r.duration).toBeGreaterThanOrEqual(0);
      expect(r.sessionKey).toBeTruthy();
    }
  });

  // ---------- abortSessionRuns ----------

  it('abortSessionRuns aborts correct runs and returns count', () => {
    lc.startRun('r1', 'sessA');
    lc.startRun('r2', 'sessA');
    lc.startRun('r3', 'sessB');

    const count = lc.abortSessionRuns('sessA', 'cleanup');

    expect(count).toBe(2);
    expect(lc.isRunning('r1')).toBe(false);
    expect(lc.isRunning('r2')).toBe(false);
    expect(lc.isRunning('r3')).toBe(true);
  });

  // ---------- multiple runs coexist ----------

  it('multiple runs can coexist independently', () => {
    lc.startRun('r1', 'sess1');
    lc.startRun('r2', 'sess2');

    expect(lc.isRunning('r1')).toBe(true);
    expect(lc.isRunning('r2')).toBe(true);

    lc.endRun('r1');
    expect(lc.isRunning('r1')).toBe(false);
    expect(lc.isRunning('r2')).toBe(true);

    lc.abortRun('r2');
    expect(lc.isRunning('r2')).toBe(false);
    expect(lc.listActiveRuns()).toHaveLength(0);
  });
});
