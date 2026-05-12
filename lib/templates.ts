import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up from this module to locate `.templates/vargos/`. Works in both dev and dist layouts. */
export function findTemplatesRoot(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, '.templates', 'vargos');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/** Walks both trees in parallel; copies only leaf files that don't exist on target. */
async function copyMissing(
  srcDir: string,
  destDir: string,
  logger: { info: (s: string) => void },
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  for (const entry of await fs.readdir(srcDir, { withFileTypes: true })) {
    const src  = path.join(srcDir,  entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyMissing(src, dest, logger);
    } else if (!existsSync(dest)) {
      await fs.copyFile(src, dest);
      logger.info(`seeded ${dest}`);
    }
  }
}

/** Seed `dataDir` from `.templates/vargos/` — recursively copies any missing files. User edits are preserved; user deletes will be re-seeded on next boot. */
export async function seedDataDir(
  dataDir: string,
  logger: { info: (s: string) => void; warn: (s: string) => void },
): Promise<void> {
  const root = findTemplatesRoot();
  if (!root) {
    logger.warn('.templates/vargos not found — skipping seed');
    return;
  }
  await copyMissing(root, dataDir, logger);
}
