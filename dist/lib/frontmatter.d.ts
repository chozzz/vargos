/**
 * Shared YAML frontmatter parser for markdown files.
 * Supports the format:
 *   ---
 *   key: value
 *   multiline:
 *     - item1
 *     - item2
 *   ---
 *   body content
 */
export interface FrontmatterResult<T = Record<string, unknown>> {
    meta: T;
    body: string;
}
/**
 * Parse YAML-ish frontmatter. The optional generic `T` lets callers declare the expected
 * meta shape — at runtime the parsed value is just cast (no validation), so callers should
 * still treat fields as optional unless they validate downstream (Zod, manual checks).
 */
export declare function parseFrontmatter<T = Record<string, unknown>>(content: string): FrontmatterResult<T> | null;
export declare function serializeFrontmatter(meta: Record<string, unknown>, body: string): string;
//# sourceMappingURL=frontmatter.d.ts.map