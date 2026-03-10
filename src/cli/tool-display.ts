import chalk from 'chalk';
import type { ToolEvent } from './client.js';

/** Format a tool event for CLI display. Returns a full line including newline. */
export function formatToolEvent(event: ToolEvent): string {
  const prefix = event.phase === 'start' ? '→' : '←';
  const color = event.phase === 'start' ? chalk.yellow : chalk.green;
  const parts = [chalk.gray(`  ${prefix} `), color(event.toolName)];

  if (event.phase === 'start' && event.args) {
    parts.push(chalk.dim(`(${summarize(event.args)})`));
  }

  if (event.phase === 'end' && event.result) {
    parts.push(chalk.dim(` → ${summarize(event.result)}`));
  }

  return parts.join('') + '\n';
}

function summarize(value: unknown, maxLen = 120): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}
