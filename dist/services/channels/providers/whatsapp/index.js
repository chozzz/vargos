/**
 * WhatsApp provider — loads and manages WhatsApp channel adapters.
 */
import { WhatsAppAdapter } from './adapter.js';
export default {
    type: 'whatsapp',
    async createAdapter(instanceId, config, deps) {
        return new WhatsAppAdapter(instanceId, deps, config.allowFrom);
    },
};
//# sourceMappingURL=index.js.map