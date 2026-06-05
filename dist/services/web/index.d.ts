import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
export declare class WebService {
    fetch(params: EventMap['web.fetch']['params']): Promise<EventMap['web.fetch']['result']>;
}
export declare function boot(bus: Bus): Promise<{
    stop?(): void;
}>;
//# sourceMappingURL=index.d.ts.map