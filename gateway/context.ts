import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { ThinkingLevel } from './events.js';

// Per-run context that propagates through async call chains automatically.
// Services read via getRunContext() — nothing needs to be threaded through signatures.

export interface RunContext {
  runId?: string;
  thinkingLevel?: ThinkingLevel;
  model?: string;
  depth: number;           // subagent nesting depth
  parentContext?: RunContext;
  workingDir?: string;     // workspace dir — accessible to tools via getRunContext()
}

const storage = new AsyncLocalStorage<RunContext>();

export const getRunContext = (): RunContext | undefined =>
  storage.getStore();

/** Start a run context. runId is auto-generated if not provided. */
export const withRunContext = <T>(ctx: RunContext, fn: () => T): T =>
  storage.run({ ...ctx, runId: ctx.runId ?? randomUUID() }, fn);
