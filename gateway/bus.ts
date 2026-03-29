import type { EventMap, EventMetadata } from './events.js';

// ─── Type helpers ─────────────────────────────────────────────────────────────

/** Keys whose EventMap entry is callable ({ params, result }) */
export type CallableEventKey = {
  [E in keyof EventMap]: EventMap[E] extends { params: unknown; result: unknown } ? E : never;
}[keyof EventMap];

/** Keys whose EventMap entry is a plain payload */
export type PureEventKey = Exclude<keyof EventMap, CallableEventKey>;

/** Extract params type from a callable event */
export type EventParams<E extends CallableEventKey> =
  EventMap[E] extends { params: infer P } ? P : never;

/** Extract result type from a callable event */
export type EventResult<E extends CallableEventKey> =
  EventMap[E] extends { result: infer R } ? R : never;

/**
 * Expected method signature for a handler of event E.
 *   Pure event    → receives the payload, returns void
 *   Callable event → receives params, returns Promise<result>
 */
export type HandlerOf<E extends keyof EventMap> =
  E extends CallableEventKey
    ? (params: EventParams<E>) => Promise<EventResult<E>>
    : (payload: EventMap[E]) => void | Promise<void>;

// ─── Bus interface ────────────────────────────────────────────────────────────

export interface Bus {
  /** Fire a pure event. Callable events cannot be emitted — use call(). */
  emit<E extends PureEventKey>(event: E, payload: EventMap[E]): void;

  /**
   * Subscribe to a pure event (listener only).
   * Handler receives the payload and returns void.
   * Returns an unsubscribe function.
   *
   * Note: Callable events are wired exclusively via @register decorators
   * and registerService(). Direct on() calls for callable events are not supported.
   */
  on<E extends PureEventKey>(event: E, handler: HandlerOf<E>): () => void;

  /** Invoke a callable event and await the result. */
  call<E extends CallableEventKey>(event: E, params: EventParams<E>): Promise<EventResult<E>>;

  /** Check if an event is callable (only @register decorated events). */
  isCallable(eventName: string): boolean;

  /** Bootstrap a service (or the bus itself if no service provided) by wiring all @on and @register decorated methods to this bus. */
  bootstrap(service?: object): void;

  /** Register a new callable tool at runtime (used by services like MCP). Returns an unsubscribe function. */
  registerToolDirect(event: string, handler: (params: unknown) => Promise<unknown>, schema: import('./decorators.js').ToolSchema): () => void;

  /** Unregister a callable tool that was previously registered at runtime. Returns true if it was removed. */
  unregisterTool(event: string): boolean;
}
