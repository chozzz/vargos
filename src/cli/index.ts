#!/usr/bin/env node

import { createRequire } from 'node:module';
import { buildTree, resolve, isGroup } from './tree.js';
import { runMenu } from './menu.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');

function printHelp(nodes: ReturnType<typeof buildTree>, prefix = ''): void {
  for (const node of nodes) {
    const path = prefix ? `${prefix} ${node.key}` : node.key;
    if (isGroup(node)) {
      console.log(`  ${path}`);
      printHelp(node.children, path);
    } else {
      const hint = (node as { hint?: string }).hint ?? '';
      console.log(`  ${path.padEnd(30)} ${hint}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tree = buildTree();

  // No args → interactive menu
  if (args.length === 0) {
    await runMenu(tree);
    return;
  }

  // Flags
  if (args[0] === '--version' || args[0] === '-V') {
    console.log(VERSION);
    return;
  }

  if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    console.log(`\n  vargos v${VERSION}\n`);
    console.log('  Usage: vargos [command]\n');
    printHelp(tree);
    console.log('');
    return;
  }

  // Route CLI args through the tree
  const result = resolve(tree, args);

  if (!result) {
    console.error(`  Unknown command: ${args.join(' ')}`);
    console.error('  Run "vargos help" for available commands.');
    process.exit(1);
  }

  const { node, remaining } = result;

  if (isGroup(node)) {
    console.log(`\n  vargos ${args.slice(0, args.length - remaining.length).join(' ')}\n`);
    console.log('  Subcommands:');
    for (const child of node.children) {
      const hint = isGroup(child) ? '' : ((child as { hint?: string }).hint ?? '');
      console.log(`    ${child.key.padEnd(20)} ${hint}`);
    }
    console.log('');
    return;
  }

  await node.action(remaining);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
