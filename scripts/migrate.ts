/**
 * Run pending data migrations manually (also runs automatically on boot).
 * Usage: pnpm migrate [--dry-run]
 */
import { runMigrations } from '../lib/migrate.js';

await runMigrations(console, { dryRun: process.argv.includes('--dry-run') });
