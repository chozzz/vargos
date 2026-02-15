/**
 * Telegram channel extension
 */

import type { VargosExtension } from '../../contracts/extension.js';
import { TelegramAdapter } from './adapter.js';

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
export { TelegramAdapter } from './adapter.js';
export type { TelegramUpdate, TelegramMessage, TelegramUser, TelegramChat } from './types.js';
