/**
 * TCP/JSON-RPC server for the bus
 * Minimal wrapper around EventEmitterBus to expose it over TCP
 */
import type { Bus } from './bus.js';
export declare function startTCPServer(bus: Bus, host: string, port: number, socketTimeoutMs?: number): Promise<() => Promise<void>>;
//# sourceMappingURL=tcp-server.d.ts.map