/**
 * Telegram provider — loads and manages Telegram channel adapters.
 */
import { TelegramAdapter } from './adapter.js';
export default {
    type: 'telegram',
    async createAdapter(instanceId, config, deps) {
        return new TelegramAdapter(instanceId, config.botToken, deps, config.allowFrom);
    },
};
//# sourceMappingURL=index.js.map