/** Interactive menu using custom readline prompts — no @clack dependency */

import chalk from 'chalk';
import { isGroup, type MenuNode } from './tree.js';
import { resolveDataDir, resolveGatewayUrl } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';
import { fetchStatus, renderStatus } from './status.js';
import { pick } from './pick.js';

const BACK = '__back__' as const;
const EXIT = '__exit__' as const;

const write = (s: string) => process.stderr.write(s);

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

    write('\x1B[J');
    const choice = await pick(breadcrumb, options);

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
      try { await node.action(); } catch { /* action cancelled or failed */ }
    }
  }

  write(`${chalk.gray('│')}\n${chalk.gray('└')}  ${chalk.dim('Bye')}\n`);
}
