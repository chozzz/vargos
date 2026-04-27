/**
 * Generic async handler and callback type definitions.
 * Reusable across services for consistent typing of async operations.
 */

/** Basic async handler: input → Promise<output> */
export type AsyncHandler<I, O = void> = (input: I) => Promise<O>;

/** Batch async handler: multiple inputs → Promise<output> */
export type AsyncBatchHandler<I, O = void> = (batch: I[]) => Promise<O>;

/** Optional async handler (may not be implemented) */
export type OptionalAsyncHandler<I, O = void> = AsyncHandler<I, O> | undefined;

/** Variadic async handler: any arguments → Promise<output> */
export type AsyncFunction<O = void> = (...args: unknown[]) => Promise<O>;
