// Vargos entrypoint — a tiny supervisor.
// Spawns boot.ts (or boot.js in prod) as a child process and respawns it when
// it exits with RESTART_EXIT_CODE (42). bus.restart triggers that exit code
// after draining stoppers; other exit codes pass through.
//
// Why a separate process: a fresh Node process re-reads all code from disk,
// so `git pull && bus.restart` reliably picks up source AND transitive deps.
// In-process restart can't do that (ESM module cache + shared lib state).

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createLogger } from './lib/logger.js';

const RESTART_EXIT_CODE = 42;
const RESPAWN_DELAY_MS = 500;
const log = createLogger('supervisor');

const here = dirname(fileURLToPath(import.meta.url));
const isDev = import.meta.url.endsWith('.ts');
const command = isDev ? 'tsx' : process.execPath;
const args = isDev
  ? [join(here, 'boot.ts')]
  : ['--enable-source-maps', join(here, 'boot.js')];

let child: ChildProcess | null = null;
let shuttingDown = false;

function spawnBoot(): void {
  child = spawn(command, args, { stdio: 'inherit', cwd: here });
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      process.exit(code ?? (signal ? 1 : 0));
      return;
    }
    if (code === RESTART_EXIT_CODE) {
      log.info('restart requested; respawning boot');
      setTimeout(spawnBoot, RESPAWN_DELAY_MS);
    } else {
      process.exit(code ?? (signal ? 1 : 0));
    }
  });
}

function forward(sig: NodeJS.Signals): void {
  shuttingDown = true;
  if (child && !child.killed) child.kill(sig);
}

process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));

spawnBoot();