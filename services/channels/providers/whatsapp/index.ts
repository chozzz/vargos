/**
 * WhatsApp provider — loads and manages WhatsApp channel adapters.
 */

import type { ChannelProvider, ChannelAdapter, AdapterDeps } from '../../contracts.js';
import type { WhatsAppChannel } from '../../../config/schemas/channels.js';
import { WhatsAppAdapter } from './adapter.js';

export default {
  type: 'whatsapp',
  async createAdapter(instanceId: string, config: WhatsAppChannel, deps: AdapterDeps): Promise<ChannelAdapter> {
    return new WhatsAppAdapter(instanceId, deps);
  },
} satisfies ChannelProvider<WhatsAppChannel>;
