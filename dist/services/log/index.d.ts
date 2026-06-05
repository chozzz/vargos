import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
export declare class LogService {
    private logFile;
    private currentDate;
    onLog(payload: EventMap['log.onLog']): void;
    search(params: EventMap['log.search']['params']): Promise<EventMap['log.search']['result']>;
    private todayFile;
    private persist;
}
export declare function boot(bus: Bus): Promise<{
    stop?(): void;
}>;
//# sourceMappingURL=index.d.ts.map