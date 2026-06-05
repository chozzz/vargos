import { EventEmitterBus } from './gateway/emitter.js';
import { startTCPServer } from './gateway/tcp-server.js';
import { createLogger } from './lib/logger.js';
import { seedDataDir } from './lib/templates.js';
import { runMigrations } from './lib/migrate.js';
import { z } from 'zod';
// ── Boot order ────────────────────────────────────────────────────────────────
// Each entry: [label, () => import(module)]
// Comment out services not yet built — add them back as they land.
const SERVICES = [
    ['config', () => import('./services/config/index.js')],
    ['log', () => import('./services/log/index.js')],
    ['web', () => import('./services/web/index.js')],
    ['memory', () => import('./services/memory/index.js')],
    ['media', () => import('./services/media/index.js')],
    ['agent', () => import('./services/agent/index.js')],
    ['channels', () => import('./services/channels/index.js')],
    ['cron', () => import('./services/cron/index.js')],
    ['mcp-client', () => import('./services/mcp-client/index.js')],
    // ['webhooks', () => import('./edge/webhooks/index.js')],
    // ['mcp',      () => import('./edge/mcp/index.js')],
];
// Fail fast on a duplicated label — each service boots exactly once.
const labels = SERVICES.map(([label]) => label);
if (new Set(labels).size !== labels.length) {
    throw new Error(`duplicate service label in SERVICES: ${labels.join(', ')}`);
}
// ── Boot ──────────────────────────────────────────────────────────────────────
const RESTART_EXIT_CODE = 42;
const bus = new EventEmitterBus();
const log = createLogger('boot');
const serviceStops = new Map(); // label → stop(); kept current across restarts
let tcpStop;
const drain = () => Promise.allSettled([...serviceStops.values(), ...(tcpStop ? [tcpStop] : [])].map(s => s()));
// Bootstrap the bus itself (registers bus.search and bus.inspect)
bus.bootstrap();
// Seed bundled templates into the VARGOS data dir before services boot.
await seedDataDir(log);
// Apply pending one-time data migrations (run-once, tracked in ~/.vargos/.migrations.json).
await runMigrations(log);
for (const [label, load] of SERVICES) {
    try {
        const { boot } = await load();
        const { stop } = await boot(bus);
        if (stop)
            serviceStops.set(label, stop);
        // Per-service restart via bus.restart({ service }). The cached module is reused,
        // so this resets in-memory state but does NOT reload code — bus.bootstrap()
        // un-wires the old instance's listeners, restartProcess reloads code from disk.
        bus.onRestart(label, async () => {
            log.info(`restarting "${label}" — re-instantiating from cached module`);
            await serviceStops.get(label)?.();
            const { boot: reBoot } = await load();
            const { stop: newStop } = await reBoot(bus);
            if (newStop)
                serviceStops.set(label, newStop);
            else
                serviceStops.delete(label);
            log.info(` ✅ "${label}" restarted`);
        });
        log.info(` ✅ "${label}" service booted`);
    }
    catch (err) {
        log.error(`❌ failed to boot ${label}: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
// Start TCP server for CLI access
const config = await bus.call('config.get', {});
const tcpHost = config.gateway.host ?? (process.env.BUS_HOST || '127.0.0.1');
const tcpPort = parseInt(config.gateway.port ? String(config.gateway.port) : (process.env.BUS_PORT || '9000'), 10);
try {
    const socketTimeoutMs = config.gateway.requestTimeout ?? 30_000;
    tcpStop = await startTCPServer(bus, tcpHost, tcpPort, socketTimeoutMs);
}
catch (err) {
    log.error(`failed to start TCP server: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
}
// Signal that boot is complete — deferred startup can proceed
bus.emit('bus.onReady', {});
// Boot summary
log.info(`✅ ${labels.length} services booted: ${labels.join(', ')}`);
// ── Process restart (registered as a runtime tool) ──────────────────────────
// Returns ok immediately; cleanup + exit happen on the next tick so the caller
// (e.g. an agent) receives the response before the process exits. The supervisor
// (index.ts) respawns this process on RESTART_EXIT_CODE.
bus.registerTool('bus.restartProcess', async () => {
    setImmediate(async () => {
        log.info('process restart requested — draining and exiting');
        await drain();
        process.exit(RESTART_EXIT_CODE);
    });
    return { ok: true };
}, {
    description: 'Restart the entire vargos process. The supervisor respawns boot.ts so new code from disk (e.g. after git pull or npm update) takes effect. Returns immediately; teardown runs after the response is sent.',
    schema: z.object({}).default({}),
});
// ── Global error handlers ────────────────────────────────────────────────────
// Prevent undici socket errors (UND_ERR_SOCKET "other side closed") from
// crashing the process when LLM providers close connections after streaming.
process.on('uncaughtException', (err) => {
    log.error(`uncaughtException: ${err.stack ?? err.message ?? err}`);
    // Do NOT exit — most undici/stream errors are non-fatal teardown noise.
});
// ── Shutdown ──────────────────────────────────────────────────────────────────
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
async function shutdown() {
    log.info('shutting down');
    await drain();
    process.exit(0);
}
//# sourceMappingURL=boot.js.map