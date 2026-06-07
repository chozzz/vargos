/**
 * WhatsApp provider — loads and manages WhatsApp channel adapters.
 */
import type { ChannelAdapter, AdapterDeps } from '../../types.js';
import type { WhatsAppChannel } from '../../../config/schemas/channels.js';
declare const _default: {
    type: "whatsapp";
    createAdapter(instanceId: string, config: WhatsAppChannel, deps: AdapterDeps): Promise<ChannelAdapter>;
};
export default _default;
//# sourceMappingURL=index.d.ts.map