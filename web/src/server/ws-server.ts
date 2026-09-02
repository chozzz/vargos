/**
 * The live-update WebSocket server moved into the daemon (`edge/web` service),
 * which has direct bus access and outlives Next restarts. API routes still call
 * `ensureWsServer()`; it is now a no-op kept only so those call sites don't change.
 */
export async function ensureWsServer(): Promise<void> {}
