/** Interactive menu walker using @clack/prompts */

import { select, intro, outro, isCancel } from '@clack/prompts';
import { isGroup, type MenuNode } from './tree.js';

type Choice = string; // node key, '__back__', or '__exit__'

const BACK: Choice = '__back__';
const EXIT: Choice = '__exit__';

export async function runMenu(tree: MenuNode[]): Promise<void> {
  intro('Vargos');
  await runSubmenu(tree, 'vargos');
  outro('Bye');
}

function nodeMap(nodes: MenuNode[]): Map<string, MenuNode> {
  const map = new Map<string, MenuNode>();
  for (const n of nodes) map.set(n.key, n);
  return map;
}

async function runSubmenu(nodes: MenuNode[], breadcrumb: string): Promise<void> {
  const lookup = nodeMap(nodes);

  while (true) {
    const options = [
      ...nodes.map((n) => ({
        value: n.key,
        label: n.label,
        hint: isGroup(n) ? undefined : (n as { hint?: string }).hint,
      })),
      { value: EXIT, label: 'Exit' },
    ];

    const choice = await select({ message: breadcrumb, options });
    if (isCancel(choice)) return;

    if (choice === EXIT) return;

    const node = lookup.get(choice);
    if (!node) continue;

    if (isGroup(node)) {
      await runGroupSubmenu(node, breadcrumb);
    } else {
      await node.action();
    }
  }
}

async function runGroupSubmenu(group: MenuNode & { children: MenuNode[] }, parentCrumb: string): Promise<void> {
  const lookup = nodeMap(group.children);
  const breadcrumb = `${parentCrumb} > ${group.label}`;

  while (true) {
    const options = [
      ...group.children.map((n) => ({
        value: n.key,
        label: n.label,
        hint: isGroup(n) ? undefined : (n as { hint?: string }).hint,
      })),
      { value: BACK, label: 'Back' },
      { value: EXIT, label: 'Exit' },
    ];

    const choice = await select({ message: breadcrumb, options });
    if (isCancel(choice) || choice === EXIT) process.exit(0);
    if (choice === BACK) return;

    const node = lookup.get(choice);
    if (!node) continue;

    if (isGroup(node)) {
      await runGroupSubmenu(node, breadcrumb);
    } else {
      await node.action();
    }
  }
}
