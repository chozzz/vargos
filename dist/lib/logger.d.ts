import type { Bus } from '../gateway/bus.js';
import type { Json } from '../gateway/events.js';
/** Called once by LogService.boot() to wire the global logger to the bus. */
export declare function setLoggerBus(bus: Bus): void;
export declare function ts(): string;
export declare function createLogger(service: string): {
    debug: (msg: string, data?: Json) => void;
    info: (msg: string, data?: Json) => void;
    warn: (msg: string, data?: Json) => void;
    error: (msg: string, data?: Json) => void;
};
//# sourceMappingURL=logger.d.ts.map