import { EventEmitterBus } from './gateway/emitter.js';
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
  ['tools', () => import('./services/tools/index.js')],
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

log.info('ready');

// ── Shutdown ──────────────────────────────────────────────────────────────────

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  log.info('shutting down');
  await Promise.allSettled(stoppers.map(s => s()));
  process.exit(0);
}
