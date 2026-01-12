/**
 * Channel adapter factory
 * Creates adapter instances from channel config
 */

import type { ChannelAdapter, ChannelConfig } from './types.js';
import { WhatsAppAdapter } from './whatsapp/index.js';
import { TelegramAdapter } from './telegram/index.js';

export function createAdapter(config: ChannelConfig): ChannelAdapter {
  switch (config.type) {
    case 'whatsapp':
      return new WhatsAppAdapter();
    case 'telegram':
      if (!config.botToken) throw new Error('Telegram requires a botToken');
      return new TelegramAdapter(config.botToken);
    default:
      throw new Error(`Unknown channel type: ${config.type}`);
  }
}
