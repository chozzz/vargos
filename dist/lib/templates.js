import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDataPaths } from './paths.js';
// Seeding is always copy-missing (user edits preserved). These files are additionally
// offered for update by `vargos sync` when the bundled version changes — the user picks
// which to overwrite. Scoped to AGENTS.md only; SOUL/TOOLS/MEMORY are never touched.
// Paths are POSIX-relative to the data dir.
const OVERRIDABLE = new Set(['workspace/AGENTS.md']);
/** Walk up from this module to locate `.templates/`. Works in both dev and dist layouts. */
export function findTemplatesRoot() {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    while (dir !== path.dirname(dir)) {
        const candidate = path.join(dir, '.templates');
        if (existsSync(candidate))
            return candidate;
        dir = path.dirname(dir);
    }
    return null;
}
/** Recursively list every bundled template file. */
async function walkTemplates(srcDir, destDir, rel = '') {
    const out = [];
    for (const entry of await fs.readdir(srcDir, { withFileTypes: true })) {
        const src = path.join(srcDir, entry.name);
        const dest = path.join(destDir, entry.name);
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            out.push(...await walkTemplates(src, dest, childRel));
        else
            out.push({ rel: childRel, src, dest });
    }
    return out;
}
/** True when dest exists and its bytes differ from the bundled source. */
async function differs(src, dest) {
    if (!existsSync(dest))
        return false;
    const [a, b] = await Promise.all([fs.readFile(src), fs.readFile(dest)]);
    return !a.equals(b);
}
async function copy(file) {
    await fs.mkdir(path.dirname(file.dest), { recursive: true });
    await fs.copyFile(file.src, file.dest);
}
/**
 * Seed the VARGOS data dir from `.templates/`. Copy-missing only — user edits are always
 * preserved. Updating a file that already exists is opt-in via `vargos sync`.
 */
export async function seedDataDir(logger) {
    const root = findTemplatesRoot();
    if (!root) {
        logger.warn('.templates not found — skipping seed');
        return;
    }
    for (const file of await walkTemplates(root, getDataPaths().dataDir)) {
        if (existsSync(file.dest))
            continue;
        await copy(file);
        logger.info(`seeded ${file.dest}`);
    }
}
/**
 * Overridable bundled templates that exist on disk but differ — candidates for `vargos sync`.
 * Scoped to OVERRIDABLE (AGENTS.md), so user-owned files are never offered for overwrite.
 */
export async function collectTemplateConflicts() {
    const root = findTemplatesRoot();
    if (!root)
        return [];
    const conflicts = [];
    for (const file of await walkTemplates(root, getDataPaths().dataDir)) {
        if (OVERRIDABLE.has(file.rel) && await differs(file.src, file.dest))
            conflicts.push(file);
    }
    return conflicts;
}
/** Overwrite the given dests from their bundled source (user confirms selection first). */
export async function overrideTemplates(files) {
    for (const file of files)
        await copy(file);
}
//# sourceMappingURL=templates.js.map