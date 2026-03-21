#!/usr/bin/env node
import { start } from './gateway/start.js';
import { toMessage } from './lib/error.js';

start().catch((err) => {
  console.error(toMessage(err));
  process.exit(1);
});
