/**
 * Telegram channel extension
 */

import type { VargosExtension } from '../../tools/extension.js';
import { TelegramAdapter } from '../../channels/telegram/adapter.js';

const extension: VargosExtension = {
  id: 'channel-telegram',
  name: 'Telegram Channel',
  register(ctx) {
    ctx.registerChannel('telegram', (config) => {
      if (!config.botToken) throw new Error('Telegram requires a botToken');
      return new TelegramAdapter(config.botToken, config.allowFrom);
    });
  },
};

export default extension;
export { TelegramAdapter } from '../../channels/telegram/adapter.js';
export type { TelegramUpdate, TelegramMessage, TelegramUser, TelegramChat } from '../../channels/telegram/types.js';
