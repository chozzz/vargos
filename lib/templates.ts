import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up from this module to locate `.templates/vargos/<name>/`. Works in both dev and dist layouts. */
export function findTemplatesDir(name: string): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, '.templates', 'vargos', name);
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/** First-run init: create `targetDir` and seed it from `.templates/vargos/<templateName>/`. Skips if dir already exists. */
export async function seedFromTemplate(
  targetDir: string,
  templateName: string,
  logger: { info: (s: string) => void; warn: (s: string) => void },
): Promise<void> {
  if (existsSync(targetDir)) return;
  await fs.mkdir(targetDir, { recursive: true });
  const src = findTemplatesDir(templateName);
  if (!src) {
    logger.warn(`${templateName} templates not found — skipping seed`);
    return;
  }
  await fs.cp(src, targetDir, { recursive: true });
  logger.info(`seeded ${targetDir} from .templates/vargos/${templateName}`);
}
