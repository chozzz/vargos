#!/usr/bin/env node

/**
 * Vargos v2 Interactive CLI
 *
 * Connects to a running bus server and provides an interactive REPL
 * for calling bus events and observing results.
 */

import { TCPBusClient } from './client.js';
import { startREPL } from './repl.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('cli');

async function main(): Promise<void> {
  const host = process.env.BUS_HOST || '127.0.0.1';
  const port = parseInt(process.env.BUS_PORT || '9000', 10);

  const client = new TCPBusClient(host, port);

  try {
    await client.connect();
  } catch {
    log.error(`❌ Failed to connect to bus at ${host}:${port}`);
    log.error(`Make sure the server is running: npm run start`);
    process.exit(1);
  }

  await startREPL(client);
}

main().catch(err => {
  log.error(`Fatal: ${err}`);
  process.exit(1);
});
