/**
 * Ensure better-sqlite3 is correctly compiled for the current Node.js version.
 * Automatically rebuilds if NODE_MODULE_VERSION mismatch is detected.
 */

import { execSync } from 'node:child_process';
import { createLogger } from './logger.js';

const log = createLogger('boot');

export async function ensureSqliteReady(): Promise<void> {
  try {
    // Try to import better-sqlite3 to check if it's compatible
    await import('better-sqlite3');
    log.debug('better-sqlite3: ready');
  } catch (err) {
    const message = String(err);
    if (message.includes('NODE_MODULE_VERSION')) {
      log.warn('better-sqlite3 version mismatch detected, rebuilding...');
      try {
        execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
        log.info('better-sqlite3 rebuilt successfully');
      } catch (buildErr) {
        log.error('failed to rebuild better-sqlite3', {
          error: buildErr instanceof Error ? buildErr.message : String(buildErr),
        });
        throw buildErr;
      }
    } else {
      // Other error, re-throw
      throw err;
    }
  }
}
