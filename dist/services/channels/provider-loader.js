/**
 * Channel provider loader — registers built-in channel providers.
 * Each provider directory must have a default export of a ChannelProvider.
 */
import { loadProviders as loadProviderRegistry } from '../../lib/provider-loader.js';
const providers = {
    telegram: () => import('./providers/telegram/index.js').then(m => m.default),
    whatsapp: () => import('./providers/whatsapp/index.js').then(m => m.default),
};
export async function loadProviders() {
    return loadProviderRegistry(providers);
}
//# sourceMappingURL=provider-loader.js.map