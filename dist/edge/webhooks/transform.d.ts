export type TransformFn = (payload: unknown) => string;
export declare function passthroughTransform(payload: unknown): string;
/**
 * Load a transform module. Path must resolve within baseDir.
 * Caches loaded modules to avoid re-importing.
 */
export declare function loadTransform(modulePath: string, baseDir?: string): Promise<TransformFn>;
//# sourceMappingURL=transform.d.ts.map