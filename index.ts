import { EventEmitterBus } from './gateway/emitter.js';
import { startTCPServer } from './gateway/tcp-server.js';
import { createLogger } from './lib/logger.js';

// ── Boot order ────────────────────────────────────────────────────────────────
// Each entry: [label, () => import(module)]
// Comment out services not yet built — add them back as they land.

const SERVICES: Array<[string, () => Promise<{ boot(bus: EventEmitterBus): Promise<{ stop?(): unknown }> }>]> = [
  ['config', () => import('./services/config/index.js')],
  ['log', () => import('./services/log/index.js')],
  ['sessions', () => import('./services/sessions/index.js')],
  ['fs', () => import('./services/fs/index.js')],
  ['web', () => import('./services/web/index.js')],
  ['workspace', () => import('./services/workspace/index.js')],
  ['memory', () => import('./services/memory/index.js')],
  ['agent', () => import('./services/agent/index.js')],
  ['cron', () => import('./services/cron/index.js')],
  ['channels', () => import('./services/channels/index.js')],
  // ['webhooks', () => import('./edge/webhooks/index.js')],
  // ['mcp',      () => import('./edge/mcp/index.js')],
];

// ── Boot ──────────────────────────────────────────────────────────────────────

const bus = new EventEmitterBus();
const log = createLogger('boot');
const stoppers: Array<() => unknown> = [];

// Bus self-registers for introspection via @on decorators
bus.registerService(bus);

for (const [label, load] of SERVICES) {
  try {
    const { boot } = await load();
    const { stop } = await boot(bus);
    if (stop) stoppers.push(stop);
  } catch (err) {
    log.error(`failed to boot ${label}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}


// Start TCP server for CLI access
const tcpHost = process.env.BUS_HOST || '127.0.0.1';
const tcpPort = parseInt(process.env.BUS_PORT || '9000', 10);
try {
  const tcpStopper = await startTCPServer(bus, tcpHost, tcpPort);
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
