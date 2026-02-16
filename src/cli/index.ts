#!/usr/bin/env node

import { createRequire } from 'node:module';
import chalk from 'chalk';
import { buildTree, resolve, isGroup } from './tree.js';
import { runMenu } from './menu.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');

function printTree(nodes: ReturnType<typeof buildTree>, indent = '', isLast: boolean[] = []): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const last = i === nodes.length - 1;
    const connector = last ? '└─' : '├─';
    const hint = !isGroup(node) && (node as { hint?: string }).hint
      ? `  ${chalk.dim((node as { hint?: string }).hint!)}`
      : '';

    console.log(`${indent}${connector} ${node.key}${hint}`);

    if (isGroup(node)) {
      const childIndent = indent + (last ? '   ' : '│  ');
      printTree(node.children, childIndent, [...isLast, last]);
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
    printTree(tree, '  ');
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
    const path = args.slice(0, args.length - remaining.length).join(' ');
    console.log(`\n  vargos ${path}\n`);
    printTree(node.children, '  ');
    console.log('');
    return;
  }

  await node.action(remaining);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
