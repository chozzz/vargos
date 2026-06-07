/**
 * Generic dynamic provider loader — reusable across services.
 * Supports lazy-loaded providers with error handling and logging.
 */
/**
 * Loads and returns providers from a registry of lazy loaders.
 * Logs warnings for failed providers, continues loading others.
 */
export declare function loadProviders<T>(providerRegistry: Record<string, () => Promise<T>>): Promise<T[]>;
//# sourceMappingURL=provider-loader.d.ts.map