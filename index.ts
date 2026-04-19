import { EventEmitterBus } from './gateway/emitter.js';
import { startTCPServer } from './gateway/tcp-server.js';
import { createLogger } from './lib/logger.js';

// ── Boot order ────────────────────────────────────────────────────────────────
// Each entry: [label, () => import(module)]
// Comment out services not yet built — add them back as they land.

const SERVICES: Array<[string, () => Promise<{ boot(bus: EventEmitterBus): Promise<{ stop?(): unknown }> }>]> = [
  ['config', () => import('./services/config/index.js')],
  ['log', () => import('./services/log/index.js')],
  ['fs', () => import('./services/fs/index.js')],
  ['web', () => import('./services/web/index.js')],
  ['memory', () => import('./services/memory/index.js')],
  ['media', () => import('./services/media/index.js')],
  ['agent', () => import('./services/agent/index.js')],
  // ['cron', () => import('./services/cron/index.js')],
  ['channels', () => import('./services/channels/index.js')],
  // ['mcp-client', () => import('./services/mcp-client/index.js')],
  // ['webhooks', () => import('./edge/webhooks/index.js')],
  // ['mcp',      () => import('./edge/mcp/index.js')],
];

// ── Boot ──────────────────────────────────────────────────────────────────────

const bus = new EventEmitterBus();
const log = createLogger('boot');
const stoppers: Array<() => unknown> = [];

// Bootstrap the bus itself (registers bus.search and bus.inspect)
bus.bootstrap();

for (const [label, load] of SERVICES) {
  try {
    log.debug(`loading ${label}...`);
    const { boot } = await load();
    log.debug(`booting ${label}...`);
    const { stop } = await boot(bus);
    log.debug(`${label} booted`);
    if (stop) stoppers.push(stop);
  } catch (err) {
    log.error(`failed to boot ${label}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}


// Start TCP server for CLI access\
const config = await bus.call('config.get', {});
const tcpHost = config.gateway.host ?? (process.env.BUS_HOST || '127.0.0.1');
const tcpPort = parseInt(config.gateway.port ? String(config.gateway.port) : (process.env.BUS_PORT || '9000'), 10);
try {
  const socketTimeoutMs = config.gateway.requestTimeout ?? 30_000;
  const tcpStopper = await startTCPServer(bus, tcpHost, tcpPort, socketTimeoutMs);
  stoppers.push(tcpStopper);
} catch (err) {
  log.error(`failed to start TCP server: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

// Signal that boot is complete — deferred startup can proceed
bus.emit('bus.onReady', {});
log.info('ready\n\n');

// ── Shutdown ──────────────────────────────────────────────────────────────────

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  log.info('shutting down');
  await Promise.allSettled(stoppers.map(s => s()));
  process.exit(0);
}
