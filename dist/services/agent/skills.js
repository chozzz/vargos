import path from 'node:path';
import { existsSync } from 'node:fs';
/**
 * Resolve `<root>/skills/` for each input root, filtered to directories that exist on disk.
 * Order is preserved (caller-defined precedence). Used to feed Pi SDK's `additionalSkillPaths`.
 *
 * Pi SDK's `DefaultResourceLoader` already auto-loads `<agentDir>/skills/` and
 * `<cwd>/.pi/skills/` — don't pass those here, they'd double-load.
 */
export function resolveSkillPaths(...roots) {
    return roots
        .map(p => path.join(p, 'skills'))
        .filter(p => existsSync(p));
}
//# sourceMappingURL=skills.js.map