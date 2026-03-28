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

export const HANDLERS    = Symbol('vargos.handlers');
export const TOOL_SCHEMAS = Symbol('vargos.toolSchemas');

export interface HandlerEntry {
  event:  keyof EventMap;
  method: string;
  tool?:  ToolSchema;
}

type HasHandlers = {
  [HANDLERS]?:     HandlerEntry[];
  [TOOL_SCHEMAS]?: Map<string, ToolSchema>;
};

// ─── Decorator ────────────────────────────────────────────────────────────────

/**
 * Marks a method as a bus handler for the given event.
 *   Pure event    → (payload: EventMap[E]) => void | Promise<void>
 *   Callable event → (params: EventMap[E]['params']) => Promise<EventMap[E]['result']>
 *
 * Pass a ToolSchema as the second arg to also expose the handler as an agent tool.
 * Handlers are wired by bus.registerService() at boot.
 */
export function on<E extends keyof EventMap>(event: E, tool?: ToolSchema) {
  return function (
    method: HandlerOf<E>,
    context: ClassMethodDecoratorContext,
  ): HandlerOf<E> {
    context.addInitializer(function (this: unknown) {
      const self = this as HasHandlers;
      (self[HANDLERS] ??= []).push({ event, method: String(context.name), tool });
      if (tool) {
        (self[TOOL_SCHEMAS] ??= new Map()).set(event as string, tool);
      }
    });
    return method;
  };
}
