import { z } from 'zod';
import type { EventMap } from './events.js';
import type { HandlerOf } from './bus.js';

// ─── Tool schema (opt-in: makes the handler an agent-callable tool) ───────────

export interface ToolSchema {
  description: string;
  schema:      z.ZodTypeAny;
  format?:     (result: unknown) => string;
}

// ─── Internal metadata storage ────────────────────────────────────────────────

export const HANDLERS = Symbol('vargos.handlers');     // @on decorated methods
export const TOOLS    = Symbol('vargos.tools');         // @register decorated methods

export interface HandlerEntry {
  event:  keyof EventMap;
  method: string;
}

export interface RegisteredEntry extends HandlerEntry {
  schema: ToolSchema;
}

type HasHandlers = {
  [HANDLERS]?: HandlerEntry[];
  [TOOLS]?:    RegisteredEntry[];
};

// ─── Decorator ────────────────────────────────────────────────────────────────

/**
 * Marks a method as a listener for a bus event.
 *   Pure event    → (payload: EventMap[E]) => void | Promise<void>
 *   Callable event (rare) → (params: EventMap[E]['params']) => Promise<EventMap[E]['result']>
 *
 * Use @register instead for callable events that should be agent-accessible.
 * Handlers are wired by bus.bootstrap() at boot.
 */
export function on<E extends keyof EventMap>(event: E) {
  return function (
    method: HandlerOf<E>,
    context: ClassMethodDecoratorContext,
  ): HandlerOf<E> {
    context.addInitializer(function (this: unknown) {
      const self = this as HasHandlers;
      (self[HANDLERS] ??= []).push({ event, method: String(context.name) });
    });
    return method;
  };
}

/**
 * Marks a method as a callable event provider (agent-accessible RPC endpoint).
 *
 * Required params:
 *   - event: the callable event name (e.g., 'agent.execute')
 *   - tool: ToolSchema with description and zod schema for introspection
 *
 * Signature: (params: EventMap[E]['params']) => Promise<EventMap[E]['result']>
 *
 * Handlers are wired by bus.bootstrap() at boot.
 */
export function register<E extends keyof EventMap>(event: E, tool: ToolSchema) {
  return function (
    method: HandlerOf<E>,
    context: ClassMethodDecoratorContext,
  ): HandlerOf<E> {
    context.addInitializer(function (this: unknown) {
      const self = this as HasHandlers;
      (self[TOOLS] ??= []).push({ event, method: String(context.name), schema: tool });
    });
    return method;
  };
}
