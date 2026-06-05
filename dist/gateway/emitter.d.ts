import type { EventMap, EventMetadata } from './events.js';
import type { Bus, HandlerOf, CallableEventKey, PureEventKey } from './bus.js';
import { type ToolSchema } from './decorators.js';
import type { EventParams, EventResult } from './bus.js';
/**
 * Predicate: is this event metadata a usable tool?
 * (type === 'tool', has a description, and has a schema)
 */
export declare function isToolEvent(metadata: EventMetadata): boolean;
export declare class EventEmitterBus implements Bus {
    private readonly ee;
    private readonly timeoutMs;
    private readonly callableRegistry;
    private readonly handlersRegistry;
    private readonly restartFactories;
    private readonly teardowns;
    constructor(timeoutMs?: number);
    emit<E extends PureEventKey>(event: E, payload: EventMap[E]): void;
    on<E extends PureEventKey>(event: E, handler: HandlerOf<E>): () => void;
    /** Check if an event is callable (only events registered via @register). */
    isCallable(eventName: string): boolean;
    call<E extends CallableEventKey>(event: E, params: EventParams<E>): Promise<EventResult<E>>;
    /**
     * Reads @on and @register decorator metadata from a service instance (or the bus itself
     * if no service provided) and wires all declared handlers to this bus.
     */
    bootstrap(service?: object): void;
    /**
     * Register a new callable tool at runtime.
     * Used by services (like MCP) to dynamically register tools after boot.
     * Returns an unsubscribe function to remove the tool.
     */
    registerTool(event: string, handler: (params: unknown) => Promise<unknown>, schema: ToolSchema): () => void;
    /**
     * Unregister a callable tool that was previously registered at runtime.
     * Returns true if the tool existed and was removed, false otherwise.
     */
    unregisterTool(event: string): boolean;
    /**
     * Register a restart factory for a named service.
     * Called by boot.ts at boot — internal, not exposed via JSON-RPC.
     * Overwrites any existing factory for the same name (supports restart).
     */
    onRestart(serviceName: string, factory: () => Promise<void>): void;
    restart(params: EventMap['bus.restart']['params']): Promise<EventMap['bus.restart']['result']>;
    status(_params?: EventMap['bus.status']['params']): Promise<EventMap['bus.status']['result']>;
    search(params?: EventMap['bus.search']['params']): Promise<EventMetadata[]>;
    inspect(params: EventMap['bus.inspect']['params']): Promise<EventMetadata | null>;
    private registerHandlers;
    private registerTools;
}
//# sourceMappingURL=emitter.d.ts.map