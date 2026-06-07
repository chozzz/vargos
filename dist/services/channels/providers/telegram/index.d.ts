/**
 * Telegram provider — loads and manages Telegram channel adapters.
 */
import type { ChannelAdapter, AdapterDeps } from '../../types.js';
import type { TelegramChannel } from '../../../config/schemas/channels.js';
declare const _default: {
    type: "telegram";
    createAdapter(instanceId: string, config: TelegramChannel, deps: AdapterDeps): Promise<ChannelAdapter>;
};
export default _default;
//# sourceMappingURL=index.d.ts.map