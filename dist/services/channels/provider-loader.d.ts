/**
 * Channel provider loader — registers built-in channel providers.
 * Each provider directory must have a default export of a ChannelProvider.
 */
import type { ChannelProvider } from './types.js';
export declare function loadProviders(): Promise<ChannelProvider[]>;
//# sourceMappingURL=provider-loader.d.ts.map