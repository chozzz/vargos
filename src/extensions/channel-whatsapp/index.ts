/**
 * WhatsApp channel extension
 */

import type { VargosExtension } from '../../tools/extension.js';
import { WhatsAppAdapter } from '../../channels/whatsapp/adapter.js';

const extension: VargosExtension = {
  id: 'channel-whatsapp',
  name: 'WhatsApp Channel',
  register(ctx) {
    ctx.registerChannel('whatsapp', (config) => new WhatsAppAdapter(config.allowFrom));
  },
};

export default extension;
export { WhatsAppAdapter } from '../../channels/whatsapp/adapter.js';
export { createWhatsAppSocket } from '../../channels/whatsapp/session.js';
