/**
 * The live-update WebSocket server no longer runs inside Next — the daemon's
 * `edge/web` service owns it (in-process bus access, survives Next restarts).
 * Nothing to instrument here.
 */
export function register() {}
