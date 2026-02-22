/** Interactive menu walker using @clack/prompts */

import { select, intro, outro, isCancel } from '@clack/prompts';
import { isGroup, type MenuNode, type MenuLeaf } from './tree.js';
import { resolveDataDir, resolveGatewayUrl } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';
import { fetchStatus, renderStatus } from './status.js';

function isVisible(node: MenuNode): boolean {
  return !(!isGroup(node) && (node as MenuLeaf & { key: string }).hidden);
}

type Choice = string; // node key, '__back__', or '__exit__'

const BACK: Choice = '__back__';
const EXIT: Choice = '__exit__';

const out = (s: string) => process.stderr.write(s + '\n');

async function resolveUrl(): Promise<string> {
  const config = await loadConfig(resolveDataDir());
  return resolveGatewayUrl(config?.gateway);
}

async function showStatus(gatewayUrl: string): Promise<void> {
  const snap = await fetchStatus(gatewayUrl);
  out(renderStatus(snap));
}

export async function runMenu(tree: MenuNode[]): Promise<void> {
  const gatewayUrl = await resolveUrl();
  intro('Vargos');
  await runSubmenu(tree, 'vargos', gatewayUrl);
  outro('Bye');
}

function nodeMap(nodes: MenuNode[]): Map<string, MenuNode> {
  const map = new Map<string, MenuNode>();
  for (const n of nodes) map.set(n.key, n);
  return map;
}

async function runSubmenu(nodes: MenuNode[], breadcrumb: string, gatewayUrl: string): Promise<void> {
  const lookup = nodeMap(nodes);
  const visible = nodes.filter(isVisible);

  while (true) {
    await showStatus(gatewayUrl);

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
