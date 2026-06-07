import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import { MemoryContext } from './context.js';
export declare class MemoryService {
    private readonly bus;
    protected readonly log: {
        debug: (msg: string, data?: import("../config/schemas/primitives.js").Json) => void;
        info: (msg: string, data?: import("../config/schemas/primitives.js").Json) => void;
        warn: (msg: string, data?: import("../config/schemas/primitives.js").Json) => void;
        error: (msg: string, data?: import("../config/schemas/primitives.js").Json) => void;
    };
    protected readonly context: MemoryContext;
    constructor(bus: Bus);
    initialize(): Promise<void>;
    close(): Promise<void>;
    search(params: EventMap['memory.search']['params']): Promise<EventMap['memory.search']['result']>;
    read(params: EventMap['memory.read']['params']): Promise<EventMap['memory.read']['result']>;
    write(params: EventMap['memory.write']['params']): Promise<void>;
    stats(_params: EventMap['memory.stats']['params']): Promise<EventMap['memory.stats']['result']>;
}
export declare function boot(bus: Bus): Promise<{
    stop?(): void;
}>;
//# sourceMappingURL=index.d.ts.map