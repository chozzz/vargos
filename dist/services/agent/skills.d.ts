/**
 * Resolve `<root>/skills/` for each input root, filtered to directories that exist on disk.
 * Order is preserved (caller-defined precedence). Used to feed Pi SDK's `additionalSkillPaths`.
 *
 * Pi SDK's `DefaultResourceLoader` already auto-loads `<agentDir>/skills/` and
 * `<cwd>/.pi/skills/` — don't pass those here, they'd double-load.
 */
export declare function resolveSkillPaths(...roots: string[]): string[];
//# sourceMappingURL=skills.d.ts.map