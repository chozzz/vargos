import chalk from 'chalk';
import path from 'node:path';
import { pick } from '../pick.js';
import { loadAndValidate } from '../boot.js';
import { CONTEXT_FILE_NAMES, loadContextFiles } from '../../config/workspace.js';
import { editFile } from '../../lib/editor.js';

export async function show(): Promise<void> {
  const { workspaceDir } = await loadAndValidate();
  const loaded = await loadContextFiles(workspaceDir);
  const loadedNames = new Set(loaded.map((f) => f.name));

  console.log(`\n  ${chalk.bold(`Context Files`)} (${loaded.length} of ${CONTEXT_FILE_NAMES.length})\n`);

  for (const name of CONTEXT_FILE_NAMES) {
    const exists = loadedNames.has(name);
    const icon = exists ? chalk.green('\u2713') : chalk.red('\u2717');
    console.log(`    ${icon} ${name}`);
  }
  console.log();
}

export async function edit(): Promise<void> {
  const { workspaceDir } = await loadAndValidate();

  const file = await pick('Which context file?', CONTEXT_FILE_NAMES.map((name) => ({ value: name, label: name })));
  if (file === null) return;

  const filePath = path.join(workspaceDir, file);
  console.log(`\n  Opening ${chalk.gray(filePath)}...\n`);
  await editFile(filePath);
}
