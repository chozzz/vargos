/**
 * Daemon entry. Builds the bus, loads services from disk via the loader (so reload
 * picks up new code), registers lifecycle methods, starts the JSON-RPC surface, and
 * signals readiness. The supervisor (index.ts) respawns this on RESTART_EXIT_CODE.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { EmitterBus } from './core/bus.js';
import { ServiceLoader } from './core/loader.js';
import { discoverServices } from './core/services.js';
import { startRpcServer } from './core/rpc-server.js';
import { createLogger } from './lib/logger.js';
import { seedDataDir } from './lib/templates.js';
import { runMigrations } from './lib/migrate.js';
import type { AppConfig } from './services/config/index.js';

const RESTART_EXIT_CODE = 42;
const log = createLogger('boot');

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
const specs = discoverServices(here, ext);

const bus = new EmitterBus();
const loader = new ServiceLoader(bus);
let rpcStop: (() => Promise<void>) | undefined;

const drain = async () => {
  await loader.disposeAll();
  if (rpcStop) await rpcStop();
};

// ── Lifecycle methods (need the loader) ─────────────────────────────────────────

bus.register('bus.restart', {
  description: 'Reload one service from disk in-process (same PID). Picks up new code after a git pull without killing the process; other services keep running.',
  schema: z.object({ service: z.string().describe('Service name, e.g. "channel", "memory", "agent"') }),
  cli: { positional: ['service'] },
}, async (p: { service: string }) => {
  await loader.restart(p.service);
  return { ok: true };
});

bus.register('bus.status', {
  description: 'List loaded services.',
  schema: z.object({}),
}, () => ({ services: loader.names().map(name => ({ name, status: 'running' as const })) }));

bus.register('bus.restartProcess', {
  description: 'Restart the whole process via the supervisor — reloads all services and transitive deps from disk. Returns immediately; teardown runs after the response is sent.',
  schema: z.object({}),
}, () => {
  setImmediate(async () => {
    log.info('process restart requested — draining and exiting');
    await drain();
    process.exit(RESTART_EXIT_CODE);
  });
  return { ok: true };
});

// ── Boot sequence ───────────────────────────────────────────────────────────────

await seedDataDir(log);
await runMigrations(log);

for (const spec of specs) {
  try {
    await loader.load(spec);
  } catch (err) {
    log.error(`❌ failed to load ${spec.name}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

const config = await bus.call<AppConfig>('config.get', {});
const host = config.gateway.host ?? process.env.BUS_HOST ?? '127.0.0.1';
const port = parseInt(config.gateway.port ? String(config.gateway.port) : (process.env.BUS_PORT || '9000'), 10);

try {
  rpcStop = await startRpcServer(bus, host, port, config.gateway.requestTimeout ?? 35 * 60 * 1000);
} catch (err) {
  log.error(`failed to start RPC server: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

bus.emit('bus.onReady', {});
log.info(`✅ ${specs.length} services ready: ${specs.map(s => s.name).join(', ')}`);

// ── Process-level handlers ──────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  // undici "other side closed" and similar stream teardown noise must not crash the daemon.
  log.error(`uncaughtException: ${err.stack ?? err.message ?? err}`);
});

const shutdown = async () => {
  log.info('shutting down');
  await drain();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
