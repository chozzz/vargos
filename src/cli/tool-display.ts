import chalk from 'chalk';
import type { ToolEvent } from './client.js';

/** Format a tool event for CLI display. Returns string including newline. */
export function formatToolEvent(event: ToolEvent): string {
  if (event.phase === 'start') {
    const args = event.args ? summarize(event.args, 80) : '';
    return `  ${chalk.cyan(event.toolName)}${args ? chalk.dim(`(${args})`) : ''}\n`;
  }

  // phase === 'end'
  if (!event.result) return '';
  const lines = summarize(event.result, 200).split('\n');
  const indented = lines
    .slice(0, 4)
    .map((line, i) => `  ${chalk.gray(i === 0 ? '⎿' : ' ')}  ${chalk.dim(line)}`)
    .join('\n');
  return indented + '\n';
}

function summarize(value: unknown, maxLen = 120): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}
