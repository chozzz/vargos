/**
 * One-time migration: remove `.templates/vargos/` prefix from bundled templates.
 *
 * Before: `.templates/vargos/` → `~/.vargos/` (seeded with vargos/ prefix stripped)
 * After:  `.templates/` → `~/.vargos/` (same behavior, no vargos/ prefix needed)
 *
 * The seeded files in `~/.vargos/` are already in the correct locations — no migration
 * needed for user data. This script only cleans up the old template tree if it still
 * exists on disk.
 *
 * Usage: npx tsx scripts/migrate-templates.ts [--dry-run]
 */

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const OLD_TEMPLATES = path.join(ROOT_DIR, '.templates', 'vargos');
const NEW_TEMPLATES = path.join(ROOT_DIR, '.templates');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`Root dir: ${ROOT_DIR}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  // Check if old templates exist
  if (!existsSync(OLD_TEMPLATES)) {
    console.log('Old templates (.templates/vargos/) not found. Nothing to migrate.');
    console.log('If you already moved templates to .templates/, you are up to date.');
    return;
  }

  // Check if new templates already exist (partial migration)
  const newAgentDir = path.join(NEW_TEMPLATES, 'agent');
  if (existsSync(newAgentDir)) {
    console.log('New templates (.templates/) already exist. Migration may have been run.');
    console.log('If old .templates/vargos/ still exists, you can manually remove it.');
    return;
  }

  console.log('Found old templates at:', OLD_TEMPLATES);
  console.log('Target directory:', NEW_TEMPLATES);

  // List files that will be moved
  const fileCount = await countFiles(OLD_TEMPLATES);
  console.log(`\nWill move ${fileCount} file(s) from .templates/vargos/ to .templates/\n`);

  if (DRY_RUN) {
    console.log('Files that would be moved:');
    await listFiles(OLD_TEMPLATES, '.templates/');
  } else {
    // Copy files to new location
    await copyDir(OLD_TEMPLATES, NEW_TEMPLATES);
    console.log(`Copied ${fileCount} file(s) to .templates/`);

    // Remove old directory
    await fs.rm(OLD_TEMPLATES, { recursive: true, force: true });
    console.log('Removed .templates/vargos/');
  }

  console.log('\n✅ Migration complete. Next startup will use .templates/ directly.');
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(fullPath);
    } else {
      count++;
    }
  }
  return count;
}

async function listFiles(dir: string, prefix: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await listFiles(fullPath, path.join(prefix, entry.name));
    } else {
      console.log(`  ${path.join(prefix, entry.name)}`);
    }
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
