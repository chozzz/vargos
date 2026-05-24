import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDataPaths } from './paths.js';

/** Walk up from this module to locate `.templates/`. Works in both dev and dist layouts. */
export function findTemplatesRoot(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, '.templates');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/** Walks both trees in parallel; copies missing files only — user edits are always preserved. */
async function seedTree(
  srcDir: string,
  destDir: string,
  relativeDir: string,
  logger: { info: (s: string) => void },
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  for (const entry of await fs.readdir(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await seedTree(src, dest, path.join(relativeDir, entry.name), logger);
    } else if (!existsSync(dest)) {
      await fs.copyFile(src, dest);
      logger.info(`seeded ${dest}`);
    }
  }
}

/** Seed the VARGOS data dir from `.templates/`. Copies missing files only — user edits are always preserved. */
export async function seedDataDir(
  logger: { info: (s: string) => void; warn: (s: string) => void },
): Promise<void> {
  const root = findTemplatesRoot();
  if (!root) {
    logger.warn('.templates not found — skipping seed');
    return;
  }
  await seedTree(root, getDataPaths().dataDir, '', logger);
}
