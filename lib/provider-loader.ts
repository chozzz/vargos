/**
 * Generic dynamic provider loader — reusable across services.
 * Supports lazy-loaded providers with error handling and logging.
 */

import { createLogger } from './logger.js';

const log = createLogger('provider-loader');

/**
 * Loads and returns providers from a registry of lazy loaders.
 * Logs warnings for failed providers, continues loading others.
 */
export async function loadProviders<T>(
  providerRegistry: Record<string, () => Promise<T>>,
): Promise<T[]> {
  const loaded: T[] = [];
  for (const [name, loader] of Object.entries(providerRegistry)) {
    try {
      const provider = await loader();
      loaded.push(provider);
    } catch (err) {
      log.warn(`failed to load provider "${name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return loaded;
}
