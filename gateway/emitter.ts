import EventEmitter from 'node:events';
import { randomUUID } from 'node:crypto';
import type { EventMap } from './events.js';
import { CALLABLE_EVENTS } from './events.js';
import type { Bus, HandlerOf, CallableEventKey, PureEventKey } from './bus.js';
import { HANDLERS } from './decorators.js';
import type { EventParams, EventResult } from './bus.js';

// Internal wire types — never exposed through Bus
type ReqPayload  = { params: unknown; _cid: string };
type ResPayload  = { result: unknown; error?: string; _cid: string };
type AnyHandler  = (payload: unknown) => unknown;
type HasHandlers = { [HANDLERS]?: Array<{ event: keyof EventMap; method: string }> };

const DEFAULT_CALL_TIMEOUT_MS = 30_000;

export class EventEmitterBus implements Bus {
  private readonly ee = new EventEmitter();
  private readonly timeoutMs: number;

  constructor(timeoutMs = DEFAULT_CALL_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
    this.ee.setMaxListeners(200);
  }

  // ── Bus interface ───────────────────────────────────────────────────────────

  emit<E extends PureEventKey>(event: E, payload: EventMap[E]): void {
    this.ee.emit(event as string, payload);
  }

  on<E extends keyof EventMap>(event: E, handler: HandlerOf<E>): () => void {
    return CALLABLE_EVENTS.has(event)
      ? this.wireCallable(event as CallableEventKey, handler as AnyHandler)
      : this.wirePure(event as PureEventKey, handler as AnyHandler);
  }

  call<E extends CallableEventKey>(event: E, params: EventParams<E>): Promise<EventResult<E>> {
    return new Promise((resolve, reject) => {
      const cid = randomUUID();
      const reqEvent = `${event}._req`;
      const resEvent = `${event}._res`;

      const timer = setTimeout(() => {
        this.ee.off(resEvent, onReply);
        reject(new Error(`bus.call('${event}') timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const onReply = (res: ResPayload) => {
        if (res._cid !== cid) return;
        clearTimeout(timer);
        this.ee.off(resEvent, onReply);
        if (res.error !== undefined) reject(new Error(res.error));
        else resolve(res.result as EventResult<E>);
      };

      this.ee.on(resEvent, onReply);
      this.ee.emit(reqEvent, { params, _cid: cid } satisfies ReqPayload);
    });
  }

  // ── Service registration (called from index.ts after instantiation) ─────────

  /**
   * Reads @on decorator metadata from the service instance and wires all
   * declared handlers to this bus. Called in index.ts after each new Service(bus).
   */
  registerService(service: object): void {
    const entries = (service as HasHandlers)[HANDLERS] ?? [];
    for (const { event, method } of entries) {
      const fn = (service as Record<string, unknown>)[method];
      if (typeof fn !== 'function') continue;
      this.on(
        event as keyof EventMap,
        fn.bind(service) as HandlerOf<keyof EventMap>,
      );
    }
  }

  // ── Internal wiring ─────────────────────────────────────────────────────────

  private wirePure(event: PureEventKey, handler: AnyHandler): () => void {
    this.ee.on(event as string, handler);
    return () => this.ee.off(event as string, handler);
  }

  private wireCallable(event: CallableEventKey, handler: AnyHandler): () => void {
    const reqEvent = `${event}._req`;
    const resEvent = `${event}._res`;

    const wrapper = async (req: ReqPayload) => {
      try {
        const result = await handler(req.params);
        this.ee.emit(resEvent, { result, _cid: req._cid } satisfies ResPayload);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.ee.emit(resEvent, { result: undefined, error, _cid: req._cid } satisfies ResPayload);
      }
    };

    this.ee.on(reqEvent, wrapper);
    return () => this.ee.off(reqEvent, wrapper);
  }
}
