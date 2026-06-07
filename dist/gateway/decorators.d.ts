import { z } from 'zod';
import type { EventMap } from './events.js';
import type { HandlerOf } from './bus.js';
export interface ToolSchema {
    description: string;
    schema: z.ZodTypeAny;
    format?: (result: unknown) => string;
}
export declare const HANDLERS: unique symbol;
export declare const TOOLS: unique symbol;
export interface HandlerEntry {
    event: keyof EventMap;
    method: string;
}
export interface RegisteredEntry extends HandlerEntry {
    schema?: ToolSchema;
}
/**
 * Marks a method as a listener for a bus event.
 *   Pure event    → (payload: EventMap[E]) => void | Promise<void>
 *   Callable event (rare) → (params: EventMap[E]['params']) => Promise<EventMap[E]['result']>
 *
 * Use @register instead for callable events that should be agent-accessible.
 * Handlers are wired by bus.bootstrap() at boot.
 */
export declare function on<E extends keyof EventMap>(event: E): (method: HandlerOf<E>, context: ClassMethodDecoratorContext) => HandlerOf<E>;
/**
 * Marks a method as a callable event provider.
 *
 * Params:
 *   - event: the callable event name (e.g., 'agent.execute')
 *   - tool: optional ToolSchema with description and zod schema
 *           If omitted, the callable is internal (not exposed as an agent tool)
 *
 * Signature: (params: EventMap[E]['params']) => Promise<EventMap[E]['result']>
 *
 * Handlers are wired by bus.bootstrap() at boot.
 */
export declare function register<E extends keyof EventMap>(event: E, tool?: ToolSchema): (method: HandlerOf<E>, context: ClassMethodDecoratorContext) => HandlerOf<E>;
//# sourceMappingURL=decorators.d.ts.map