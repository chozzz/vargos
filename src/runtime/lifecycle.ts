/**
 * Agent lifecycle events
 * Stream start/end/error events
 */

import { EventEmitter } from 'node:events';

export type LifecyclePhase = 'start' | 'end' | 'error' | 'abort';

export interface LifecycleEvent {
  type: 'lifecycle';
  phase: LifecyclePhase;
  runId: string;
  sessionKey: string;
  timestamp: number;
  error?: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  duration?: number;
}

export interface AssistantStreamEvent {
  type: 'assistant';
  runId: string;
  sessionKey: string;
  content: string;
  isComplete: boolean;
  timestamp: number;
}

export interface ToolStreamEvent {
  type: 'tool';
  runId: string;
  sessionKey: string;
  toolName: string;
  phase: 'start' | 'end';
  args?: unknown;
  result?: unknown;
  error?: string;
  timestamp: number;
}

export interface CompactionStreamEvent {
  type: 'compaction';
  runId: string;
  sessionKey: string;
  tokensBefore: number;
  summary: string;
  timestamp: number;
}

export type AgentStreamEvent =
  | LifecycleEvent
  | AssistantStreamEvent
  | ToolStreamEvent
  | CompactionStreamEvent;

/**
 * Agent lifecycle manager
 * Emits stream events during agent runs
 */
export class AgentLifecycle extends EventEmitter {
  private activeRuns = new Map<string, {
    sessionKey: string;
    startedAt: number;
    abortController: AbortController;
  }>();


  /**
   * Start a new run
   */
  startRun(runId: string, sessionKey: string): void {
    const abortController = new AbortController();

    this.activeRuns.set(runId, {
      sessionKey,
      startedAt: Date.now(),
      abortController,
    });

    const event: LifecycleEvent = {
      type: 'lifecycle',
      phase: 'start',
      runId,
      sessionKey,
      timestamp: Date.now(),
    };

    this.emit('stream', event);
    this.emit('start', runId, sessionKey);
  }

  /**
   * End a run successfully
   */
  endRun(
    runId: string,
    tokens?: { input: number; output: number; total: number }
  ): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    const duration = Date.now() - run.startedAt;

    this.activeRuns.delete(runId);

    const event: LifecycleEvent = {
      type: 'lifecycle',
      phase: 'end',
      runId,
      sessionKey: run.sessionKey,
      timestamp: Date.now(),
      tokens,
      duration,
    };

    this.emit('stream', event);
    this.emit('end', runId, { tokens, duration });
  }

  /**
   * Error a run
   */
  errorRun(runId: string, error: Error | string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    const duration = Date.now() - run.startedAt;

    this.activeRuns.delete(runId);

    const event: LifecycleEvent = {
      type: 'lifecycle',
      phase: 'error',
      runId,
      sessionKey: run.sessionKey,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : error,
      duration,
    };

    this.emit('stream', event);
    this.emit('run_error', runId, error);
  }

  /**
   * Abort a run
   */
  abortRun(runId: string, reason?: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) return false;

    run.abortController.abort(reason || 'Aborted');

    this.activeRuns.delete(runId);

    const event: LifecycleEvent = {
      type: 'lifecycle',
      phase: 'abort',
      runId,
      sessionKey: run.sessionKey,
      timestamp: Date.now(),
      error: reason || 'Aborted',
    };

    this.emit('stream', event);
    this.emit('abort', runId, reason);

    return true;
  }

  /**
   * Check if run is active
   */
  isRunning(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  /**
   * Get abort signal for run
   */
  getAbortSignal(runId: string): AbortSignal | undefined {
    return this.activeRuns.get(runId)?.abortController.signal;
  }

  /**
   * Stream assistant delta
   */
  streamAssistant(
    runId: string,
    content: string,
    isComplete: boolean = false
  ): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    const event: AssistantStreamEvent = {
      type: 'assistant',
      runId,
      sessionKey: run.sessionKey,
      content,
      isComplete,
      timestamp: Date.now(),
    };

    this.emit('stream', event);
    this.emit('assistant', event);
  }

  /**
   * Stream tool event
   */
  streamTool(
    runId: string,
    toolName: string,
    phase: 'start' | 'end',
    args?: unknown,
    result?: unknown,
    error?: string
  ): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    const event: ToolStreamEvent = {
      type: 'tool',
      runId,
      sessionKey: run.sessionKey,
      toolName,
      phase,
      args,
      result,
      error,
      timestamp: Date.now(),
    };

    this.emit('stream', event);
    this.emit('tool', event);
  }

  /**
   * Stream compaction event
   */
  streamCompaction(
    runId: string,
    tokensBefore: number,
    summary: string
  ): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    const event: CompactionStreamEvent = {
      type: 'compaction',
      runId,
      sessionKey: run.sessionKey,
      tokensBefore,
      summary,
      timestamp: Date.now(),
    };

    this.emit('stream', event);
    this.emit('compaction', event);
  }

  /**
   * List active runs
   */
  listActiveRuns(): Array<{ runId: string; sessionKey: string; duration: number }> {
    const now = Date.now();
    return Array.from(this.activeRuns.entries()).map(([runId, run]) => ({
      runId,
      sessionKey: run.sessionKey,
      duration: now - run.startedAt,
    }));
  }

  /**
   * Abort all runs for a session
   */
  abortSessionRuns(sessionKey: string, reason?: string): number {
    let count = 0;
    for (const [runId, run] of this.activeRuns.entries()) {
      if (run.sessionKey === sessionKey) {
        this.abortRun(runId, reason);
        count++;
      }
    }
    return count;
  }
}


