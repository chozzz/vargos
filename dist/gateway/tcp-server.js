/**
 * TCP/JSON-RPC server for the bus
 * Minimal wrapper around EventEmitterBus to expose it over TCP
 */
import { createServer } from 'node:net';
import { createLogger } from '../lib/logger.js';
const log = createLogger('tcp-server');
export function startTCPServer(bus, host, port, socketTimeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
        const server = createServer((socket) => {
            log.debug(`Client connected from ${socket.remoteAddress}:${socket.remotePort}`);
            const state = { subscriptions: new Set(), buffer: '' };
            socket.on('data', (data) => {
                state.buffer += data.toString();
                processBuffer(socket, state, bus);
            });
            socket.on('end', () => {
                log.debug(`Client disconnected from ${socket.remoteAddress}:${socket.remotePort}`);
            });
            socket.on('error', (err) => {
                log.error(`Socket error: ${err.message}`);
            });
            socket.setTimeout(socketTimeoutMs);
            socket.on('timeout', () => {
                log.warn(`Client timeout: ${socket.remoteAddress}:${socket.remotePort}`);
                socket.destroy();
            });
        });
        server.listen(port, host, () => {
            log.info(`Bus server listening on ${host}:${port}`);
            resolve(async () => {
                return new Promise((resolveClose, rejectClose) => {
                    server.close((err) => {
                        if (err)
                            rejectClose(err);
                        else
                            resolveClose();
                    });
                });
            });
        });
        server.on('error', (err) => {
            log.error(`Server error: ${err.message}`);
            reject(err);
        });
    });
}
function processBuffer(socket, state, bus) {
    const lines = state.buffer.split('\n');
    state.buffer = lines[lines.length - 1];
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line)
            continue;
        try {
            const req = JSON.parse(line);
            handleRequest(socket, state, bus, req);
        }
        catch (err) {
            log.error(`Failed to parse request: ${err}`);
            socket.write(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32700, message: 'Parse error' },
                id: null,
            }) + '\n');
        }
    }
}
async function handleRequest(socket, state, bus, req) {
    const { method, params, id } = req;
    // Handle subscription
    if (method === 'bus.subscribe') {
        const { event } = params;
        if (!state.subscriptions.has(event)) {
            state.subscriptions.add(event);
            // Subscribe to the event and send notifications to client
            bus.on(event, ((payload) => {
                socket.write(JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'bus.notify',
                    params: { event, payload },
                }) + '\n');
            }));
        }
        return; // No response for subscription
    }
    // Handle RPC call
    if (!bus.isCallable(method)) {
        socket.write(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32601, message: `Method not found: ${method}` },
            id,
        }) + '\n');
        socket.end();
        return;
    }
    try {
        const result = await bus.call(method, params);
        socket.write(JSON.stringify({
            jsonrpc: '2.0',
            result,
            id,
        }) + '\n');
        socket.end();
    }
    catch (err) {
        socket.write(JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: err instanceof Error ? err.message : String(err),
            },
            id,
        }) + '\n');
        socket.end();
    }
}
//# sourceMappingURL=tcp-server.js.map