import type { EventMap } from './events.js';

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
   * Subscribe to any event.
   * For pure events: handler receives the payload.
   * For callable events: handler receives params and must return Promise<result>.
   * Returns an unsubscribe function.
   */
  on<E extends keyof EventMap>(event: E, handler: HandlerOf<E>): () => void;

  /** Invoke a callable event and await the result. */
  call<E extends CallableEventKey>(event: E, params: EventParams<E>): Promise<EventResult<E>>;
}
