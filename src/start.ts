/**
 * Legacy entry point -- delegates to CLI gateway start
 */
import { start } from './cli/gateway/start.js';

start().catch((err) => {
  console.error('');
  console.error('Fatal error:');
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error('');
  process.exit(1);
});
