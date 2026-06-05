// ─── Internal metadata storage ────────────────────────────────────────────────
export const HANDLERS = Symbol('vargos.handlers'); // @on decorated methods
export const TOOLS = Symbol('vargos.tools'); // @register decorated methods
// ─── Decorator ────────────────────────────────────────────────────────────────
/**
 * Marks a method as a listener for a bus event.
 *   Pure event    → (payload: EventMap[E]) => void | Promise<void>
 *   Callable event (rare) → (params: EventMap[E]['params']) => Promise<EventMap[E]['result']>
 *
 * Use @register instead for callable events that should be agent-accessible.
 * Handlers are wired by bus.bootstrap() at boot.
 */
export function on(event) {
    return function (method, context) {
        context.addInitializer(function () {
            const self = this;
            (self[HANDLERS] ??= []).push({ event, method: String(context.name) });
        });
        return method;
    };
}
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
export function register(event, tool) {
    return function (method, context) {
        context.addInitializer(function () {
            const self = this;
            (self[TOOLS] ??= []).push({ event, method: String(context.name), schema: tool });
        });
        return method;
    };
}
//# sourceMappingURL=decorators.js.map