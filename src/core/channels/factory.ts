/**
 * Channel adapter factory
 * Creates adapter instances from channel config
 */

import type { ChannelAdapter, ChannelConfig, GatewayCallFn } from '../../contracts/channel.js';
import { WhatsAppAdapter } from '../../extensions/channel-whatsapp/index.js';
import { TelegramAdapter } from '../../extensions/channel-telegram/index.js';

export function createAdapter(config: ChannelConfig, gatewayCall?: GatewayCallFn): ChannelAdapter {
  switch (config.type) {
    case 'whatsapp':
      return new WhatsAppAdapter(config.allowFrom, gatewayCall);
    case 'telegram':
      if (!config.botToken) throw new Error('Telegram requires a botToken');
      return new TelegramAdapter(config.botToken, config.allowFrom, gatewayCall);
    default:
      throw new Error(`Unknown channel type: ${config.type}`);
  }
}
