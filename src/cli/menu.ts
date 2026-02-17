/** Interactive menu walker using @clack/prompts */

import { select, intro, outro, isCancel } from '@clack/prompts';
import { isGroup, type MenuNode, type MenuLeaf } from './tree.js';

function isVisible(node: MenuNode): boolean {
  return !(!isGroup(node) && (node as MenuLeaf & { key: string }).hidden);
}

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
  const visible = nodes.filter(isVisible);

  while (true) {
    const options = [
      ...visible.map((n) => ({
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
  const visible = group.children.filter(isVisible);
  const breadcrumb = `${parentCrumb} > ${group.label}`;

  while (true) {
    const options = [
      ...visible.map((n) => ({
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
