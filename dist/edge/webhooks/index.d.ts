/**
 * Webhooks edge service — inbound HTTP webhooks that trigger agent runs.
 *
 * Callable: webhook.search
 * Subscribes: agent.onCompleted (delivery to notify targets)
 *
 * Inbound flow: POST /hooks/:id → validate token → transform payload
 *   → session create/addMessage → agent.execute → deliver to notify targets
 */
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
export declare class WebhooksEdge {
    private readonly bus;
    private readonly config;
    private hooks;
    private activeHooks;
    private server;
    private unsubscribeCompleted?;
    constructor(bus: Bus, config: AppConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    search(params: EventMap['webhook.search']['params']): Promise<EventMap['webhook.search']['result']>;
    private onAgentCompleted;
    private startHttp;
    private stopHttp;
    private handleRequest;
    private fireHook;
}
export declare function boot(bus: Bus): Promise<{
    stop(): Promise<void>;
}>;
//# sourceMappingURL=index.d.ts.map