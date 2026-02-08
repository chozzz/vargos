/**
 * WhatsApp channel extension
 */

import type { VargosExtension } from '../../core/extensions.js';
import { WhatsAppAdapter } from './adapter.js';

const extension: VargosExtension = {
  id: 'channel-whatsapp',
  name: 'WhatsApp Channel',
  register(ctx) {
    ctx.registerChannel('whatsapp', (config) => new WhatsAppAdapter(config.allowFrom));
  },
};

export default extension;
export { WhatsAppAdapter } from './adapter.js';
export { createWhatsAppSocket } from './session.js';
