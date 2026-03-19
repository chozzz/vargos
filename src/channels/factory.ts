/**
 * Channel adapter factory
 * Creates adapter instances from channel config
 */

import type { ChannelAdapter, OnInboundMessageFn } from './types.js';
import type { ChannelEntry } from '../config/pi-config.js';
import { WhatsAppAdapter } from './whatsapp/adapter.js';
import { TelegramAdapter } from './telegram/adapter.js';

export function createAdapter(config: ChannelEntry, onInboundMessage?: OnInboundMessageFn): ChannelAdapter {
  switch (config.type) {
    case 'whatsapp':
      return new WhatsAppAdapter(config.id, config.allowFrom, onInboundMessage, config.debounceMs);
    case 'telegram':
      if (!config.botToken) throw new Error('Telegram requires a botToken');
      return new TelegramAdapter(config.id, config.botToken, config.allowFrom, onInboundMessage, config.debounceMs);
    default:
      throw new Error(`Unknown channel type: ${config.type}`);
  }
}
