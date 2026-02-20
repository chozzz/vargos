/**
 * Channel adapter factory
 * Creates adapter instances from channel config
 */

import type { ChannelAdapter, ChannelConfig, OnInboundMessageFn } from './types.js';
import { WhatsAppAdapter } from './whatsapp/adapter.js';
import { TelegramAdapter } from './telegram/adapter.js';

export function createAdapter(config: ChannelConfig, onInboundMessage?: OnInboundMessageFn): ChannelAdapter {
  switch (config.type) {
    case 'whatsapp':
      return new WhatsAppAdapter(config.allowFrom, onInboundMessage);
    case 'telegram':
      if (!config.botToken) throw new Error('Telegram requires a botToken');
      return new TelegramAdapter(config.botToken, config.allowFrom, onInboundMessage);
    default:
      throw new Error(`Unknown channel type: ${config.type}`);
  }
}
