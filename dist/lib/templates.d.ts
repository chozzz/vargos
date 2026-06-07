/** Walk up from this module to locate `.templates/`. Works in both dev and dist layouts. */
export declare function findTemplatesRoot(): string | null;
export interface TemplateFile {
    /** POSIX path relative to the data dir, e.g. 'workspace/AGENTS.md'. */
    rel: string;
    src: string;
    dest: string;
}
/**
 * Seed the VARGOS data dir from `.templates/`. Copy-missing only — user edits are always
 * preserved. Updating a file that already exists is opt-in via `vargos sync`.
 */
export declare function seedDataDir(logger: {
    info: (s: string) => void;
    warn: (s: string) => void;
}): Promise<void>;
/**
 * Overridable bundled templates that exist on disk but differ — candidates for `vargos sync`.
 * Scoped to OVERRIDABLE (AGENTS.md), so user-owned files are never offered for overwrite.
 */
export declare function collectTemplateConflicts(): Promise<TemplateFile[]>;
/** Overwrite the given dests from their bundled source (user confirms selection first). */
export declare function overrideTemplates(files: TemplateFile[]): Promise<void>;
//# sourceMappingURL=templates.d.ts.map