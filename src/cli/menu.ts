/** Interactive menu using raw readline — avoids @clack rendering bugs */

import chalk from 'chalk';
import { emitKeypressEvents } from 'node:readline';
import { isGroup, type MenuNode } from './tree.js';
import { resolveDataDir, resolveGatewayUrl } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';
import { fetchStatus, renderStatus } from './status.js';

const BACK = '__back__';
const EXIT = '__exit__';

const write = (s: string) => process.stderr.write(s);

/** Minimal arrow-key select — full control over rendering and cleanup */
function menuSelect(message: string, options: { label: string; hint?: string; value: string }[]): Promise<string | null> {
  return new Promise((resolve) => {
    let cursor = 0;
    let resolved = false;
    const lines = options.length + 1;

    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    const draw = (clear = false) => {
      if (clear) write(`\x1B[${lines}A\x1B[J`);
      write(`${chalk.cyan('◆')}  ${message}\n`);
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const active = i === cursor;
        const bullet = active ? chalk.green('●') : chalk.dim('○');
        const text = active ? `${o.label}${o.hint ? chalk.dim(` (${o.hint})`) : ''}` : chalk.dim(o.label);
        write(`${chalk.cyan('│')}  ${bullet} ${text}\n`);
      }
    };

    const finish = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      write(`\x1B[${lines}A\x1B[J`);
      if (value && value !== BACK) {
        const picked = options.find(o => o.value === value);
        write(`${chalk.green('◇')}  ${message}\n${chalk.gray('│')}  ${chalk.dim(picked?.label ?? value)}\n`);
      } else {
        write(`${chalk.green('◇')}  ${message}\n`);
      }
      resolve(value);
    };

    const onKey = (_ch: string | undefined, key?: { name: string; ctrl?: boolean }) => {
      if (!key || resolved) return;
      if (key.name === 'up') { cursor = (cursor - 1 + options.length) % options.length; draw(true); }
      else if (key.name === 'down') { cursor = (cursor + 1) % options.length; draw(true); }
      else if (key.name === 'return') finish(options[cursor].value);
      else if (key.name === 'escape') finish(BACK);
      else if (key.ctrl && key.name === 'c') finish(null);
    };

    process.stdin.on('keypress', onKey);
    draw();
  });
}

interface Level { nodes: MenuNode[]; breadcrumb: string }

export async function runMenu(tree: MenuNode[]): Promise<void> {
  const config = await loadConfig(resolveDataDir());
  const gatewayUrl = resolveGatewayUrl(config?.gateway);

  const snap = await fetchStatus(gatewayUrl);
  write(renderStatus(snap) + '\n');

  const stack: Level[] = [{ nodes: tree, breadcrumb: 'vargos' }];

  while (stack.length > 0) {
    const { nodes, breadcrumb } = stack[stack.length - 1];

    const options = [
      ...nodes.map(n => ({
        value: n.key,
        label: n.label,
        hint: isGroup(n) ? undefined : n.hint,
      })),
      ...(stack.length > 1 ? [{ value: BACK, label: 'Back' }] : []),
      { value: EXIT, label: 'Exit' },
    ];

    // Clear any leftover lines from @clack prompts used by actions
    write('\x1B[J');
    const choice = await menuSelect(breadcrumb, options);

    if (choice === null || choice === EXIT) break;
    if (choice === BACK) {
      if (stack.length > 1) { stack.pop(); continue; }
      break;
    }

    const node = nodes.find(n => n.key === choice);
    if (!node) continue;

    if (isGroup(node)) {
      stack.push({ nodes: node.children, breadcrumb: `${breadcrumb} > ${node.label}` });
    } else {
      await node.action();
    }
  }

  write(`${chalk.gray('│')}\n${chalk.gray('└')}  ${chalk.dim('Bye')}\n`);
}
