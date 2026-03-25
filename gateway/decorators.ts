import type { EventMap } from './events.js';
import type { HandlerOf } from './bus.js';

// ─── Internal metadata storage ────────────────────────────────────────────────

export const HANDLERS = Symbol('vargos.handlers');

interface HandlerEntry {
  event: keyof EventMap;
  method: string;
}

type HasHandlers = { [HANDLERS]?: HandlerEntry[] };

// ─── Decorator ────────────────────────────────────────────────────────────────

/**
 * Marks a method as a handler for the given event.
 * The method signature is enforced by HandlerOf<E>:
 *   Pure event    → (payload: EventMap[E]) => void | Promise<void>
 *   Callable event → (params: EventMap[E]['params']) => Promise<EventMap[E]['result']>
 *
 * Handlers are wired to the bus by EventEmitterBus.registerService() in index.ts.
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
