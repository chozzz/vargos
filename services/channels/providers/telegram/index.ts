/**
 * Telegram provider — loads and manages Telegram channel adapters.
 */

import type { ChannelProvider, ChannelAdapter, AdapterDeps } from '../../contracts.js';
import type { TelegramChannel } from '../../../config/schemas/channels.js';
import { TelegramAdapter } from './adapter.js';

export default {
  type: 'telegram',
  async createAdapter(instanceId: string, config: TelegramChannel, deps: AdapterDeps): Promise<ChannelAdapter> {
    return new TelegramAdapter(instanceId, config.botToken, deps);
  },
} satisfies ChannelProvider<TelegramChannel>;
