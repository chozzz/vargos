import EventEmitter from 'node:events';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { EventMap, EventMetadata } from './events.js';
import type { Bus, HandlerOf, CallableEventKey, PureEventKey } from './bus.js';
import { on, register, HANDLERS, TOOLS, type ToolSchema } from './decorators.js';
import type { EventParams, EventResult } from './bus.js';
import { createLogger } from '../lib/logger.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const log = createLogger('bus');

// Internal wire types — never exposed through Bus
type ReqPayload = { params: unknown; _cid: string };
type ResPayload = { result: unknown; error?: string; _cid: string };
type AnyHandler = (payload: unknown) => unknown;
type HasHandlers = {
  [HANDLERS]?: Array<{ event: keyof EventMap; method: string }>;
  [TOOLS]?: Array<{ event: keyof EventMap; method: string; schema: ToolSchema }>;
};

const DEFAULT_CALL_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Predicate: is this event metadata a usable tool?
 * (type === 'tool', has a description, and has a schema)
 */
export function isToolEvent(metadata: EventMetadata): boolean {
  return metadata.type === 'tool' && metadata.description !== '(no description)' && !!metadata.schema;
}

export class EventEmitterBus implements Bus {
  private readonly ee = new EventEmitter();
  private readonly timeoutMs: number;
  private readonly callableRegistry = new Map<string, ToolSchema>(); // Callable events from @register + schemas
  private readonly handlersRegistry = new Set<string>(); // Handler events from @on

  constructor(timeoutMs = DEFAULT_CALL_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
    this.ee.setMaxListeners(200);
  }

  // ── Bus interface ───────────────────────────────────────────────────────────

  emit<E extends PureEventKey>(event: E, payload: EventMap[E]): void {
    this.ee.emit(event as string, payload);
  }

  on<E extends PureEventKey>(event: E, handler: HandlerOf<E>): () => void {
    return this.registerHandlers(event, handler as AnyHandler);
  }


  /** Check if an event is callable (only events registered via @register). */
  isCallable(eventName: string): boolean {
    return this.callableRegistry.has(eventName);
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
   * Reads @on and @register decorator metadata from a service instance (or the bus itself
   * if no service provided) and wires all declared handlers to this bus.
   */
  bootstrap(service?: object): void {
    const svc = service ?? this;
    const handlers = (svc as HasHandlers)[HANDLERS] ?? [];
    const tools = (svc as HasHandlers)[TOOLS] ?? [];

    const allEvents = [...handlers.map(e => e.event), ...tools.map(e => e.event)];
    log.info(`bootstrap: ${svc.constructor.name} → [${allEvents.join(', ')}]`);

    // Register @on handlers (pure events)
    for (const { event, method } of handlers) {
      const fn = (svc as Record<string, unknown>)[method];
      if (typeof fn !== 'function') continue;
      this.handlersRegistry.add(event as string);
      this.registerHandlers(event as PureEventKey, fn.bind(svc) as AnyHandler);
    }

    // Pre-populate callable registry, then register @register handlers (callable events)
    for (const { event, schema } of tools) {
      this.callableRegistry.set(event as string, schema);
    }



    for (const { event, method } of tools) {
      const fn = (svc as Record<string, unknown>)[method];
      if (typeof fn !== 'function') continue;
      this.registerTools(event as CallableEventKey, fn.bind(svc) as AnyHandler);
    }
  }

  // ── Runtime tool registration ─────────────────────────────────────────────────

  /**
   * Register a new callable tool at runtime.
   * Used by services (like MCP) to dynamically register tools after boot.
   * Returns an unsubscribe function to remove the tool.
   */
  registerToolDirect(event: string, handler: (params: unknown) => Promise<unknown>, schema: ToolSchema): () => void {
    // Register in the callable registry
    this.callableRegistry.set(event, schema);

    // Wire the handler using the same pattern as @register decorated methods
    return this.registerTools(event as CallableEventKey, handler as AnyHandler);
  }

  /**
   * Unregister a callable tool that was previously registered at runtime.
   * Returns true if the tool existed and was removed, false otherwise.
   */
  unregisterTool(event: string): boolean {
    const existed = this.callableRegistry.has(event);
    this.callableRegistry.delete(event);
    return existed;
  }

  // ── Bus introspection ─────────────────────────────────────────────────────────

  @register('bus.search', {
    description: 'Search all callable bus events. Optionally filter by query string.',
    schema: z.object({
      query: z.string().optional().describe('Filter events by name substring'),
    }),
  })
  async search(params?: EventMap['bus.search']['params']): Promise<EventMetadata[]> {
    const result: EventMetadata[] = [];
    const query = params?.query;

    // Include handlers
    for (const event of this.handlersRegistry) {
      if (query && !event.includes(query)) continue;
      result.push({
        event,
        description: '(no description)',
        type: 'handler',
      });
    }

    // Include tools
    for (const event of this.callableRegistry.keys()) {
      if (query && !event.includes(query)) continue;
      const toolSchema = this.callableRegistry.get(event);
      result.push({
        event,
        description: toolSchema?.description || '(no description)',
        type: 'tool',
        schema: toolSchema ? { params: zodToJsonSchema(toolSchema.schema) } : undefined,
      });
    }

    return result;
  }

  @register('bus.inspect', {
    description: 'Get detailed metadata for a specific bus event.',
    schema: z.object({
      event: z.string().describe('Event name to inspect'),
    }),
  })
  async inspect(params: EventMap['bus.inspect']['params']): Promise<EventMetadata | null> {
    // Check if it's a tool
    const toolSchema = this.callableRegistry.get(params.event);
    if (toolSchema) {
      return {
        event: params.event,
        description: toolSchema.description,
        type: 'tool',
        schema: { params: zodToJsonSchema(toolSchema.schema) },
      };
    }

    // Check if it's a handler
    if (this.handlersRegistry.has(params.event)) {
      return {
        event: params.event,
        description: '(no description)',
        type: 'handler',
      };
    }

    return null;
  }

  // ── Internal registration ──────────────────────────────────────────────────────

  private registerHandlers(event: PureEventKey, handler: AnyHandler): () => void {
    this.ee.on(event as string, handler);
    return () => this.ee.off(event as string, handler);
  }

  private registerTools(event: CallableEventKey, handler: AnyHandler): () => void {
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
