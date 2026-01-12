/**
 * Telegram channel adapter
 * Uses raw fetch against Bot API with long-polling
 * Text-only private chats, no SDK dependency
 */

import type { ChannelAdapter, ChannelStatus } from '../types.js';
import type {
  TelegramUpdate,
  TelegramResponse,
  TelegramUser,
} from './types.js';
import { createDedupeCache } from '../../lib/dedupe.js';
import { createMessageDebouncer } from '../../lib/debounce.js';
import { deliverReply } from '../../lib/reply-delivery.js';
import { getGateway, type NormalizedInput, type GatewayContext } from '../../gateway/core.js';

const API_BASE = 'https://api.telegram.org/bot';
const POLL_TIMEOUT_S = 30;
const RECONNECT_DELAY_MS = 5000;

export class TelegramAdapter implements ChannelAdapter {
  readonly type = 'telegram' as const;
  status: ChannelStatus = 'disconnected';

  private botToken: string;
  private botUser: TelegramUser | null = null;
  private offset = 0;
  private polling = false;
  private abortController: AbortController | null = null;
  private dedupe = createDedupeCache({ ttlMs: 120_000 });
  private debouncer: ReturnType<typeof createMessageDebouncer>;

  constructor(botToken: string) {
    this.botToken = botToken;
    this.debouncer = createMessageDebouncer(
      (chatId, messages) => {
        this.handleBatch(chatId, messages).catch((err) => {
          console.error(`[Telegram] handleBatch error for ${chatId}:`, err);
        });
      },
      { delayMs: 1500 },
    );
  }

  async initialize(): Promise<void> {
    // Validate token via getMe
    const me = await this.apiCall<TelegramUser>('getMe');
    this.botUser = me;
    console.error(`[Telegram] Bot verified: @${me.username} (${me.first_name})`);
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    this.polling = true;
    this.abortController = new AbortController();
    this.status = 'connected';
    console.error('[Telegram] Long-polling started');

    // Start polling loop (non-blocking)
    this.pollLoop().catch((err) => {
      console.error('[Telegram] Poll loop exited:', err);
      this.status = 'error';
    });
  }

  async stop(): Promise<void> {
    this.polling = false;
    this.debouncer.cancelAll();
    this.abortController?.abort();
    this.abortController = null;
    this.status = 'disconnected';
    console.error('[Telegram] Stopped');
  }

  async send(chatId: string, text: string): Promise<void> {
    await this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const updates = await this.apiCall<TelegramUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: POLL_TIMEOUT_S,
          allowed_updates: ['message'],
        });

        for (const update of updates) {
          this.offset = update.update_id + 1;
          this.handleUpdate(update);
        }
      } catch (err) {
        if (!this.polling) break; // Expected on shutdown
        console.error('[Telegram] Poll error:', err);
        await sleep(RECONNECT_DELAY_MS);
      }
    }
  }

  private handleUpdate(update: TelegramUpdate): void {
    const msg = update.message;
    if (!msg?.text) return;

    // Skip non-private chats
    if (msg.chat.type !== 'private') return;

    // Skip bot's own messages
    if (msg.from?.id === this.botUser?.id) return;

    const msgKey = `${msg.chat.id}:${msg.message_id}`;
    if (!this.dedupe.add(msgKey)) return;

    const chatId = String(msg.chat.id);
    console.error(`[Telegram] Received from ${chatId}: ${msg.text.slice(0, 80)}`);
    this.debouncer.push(chatId, msg.text);
  }

  private async handleBatch(chatId: string, messages: string[]): Promise<void> {
    const text = messages.join('\n');
    const sessionKey = `telegram:${chatId}`;

    const input: NormalizedInput = {
      type: 'text',
      content: text,
      metadata: { encoding: 'utf-8' },
      source: { channel: 'telegram', userId: chatId, sessionKey },
      timestamp: Date.now(),
    };

    const context: GatewayContext = {
      sessionKey,
      userId: chatId,
      channel: 'telegram',
      permissions: ['*'],
      metadata: {},
    };

    const gateway = getGateway();
    const result = await gateway.processInput(input, context);

    if (result.success && result.content) {
      const replyText = typeof result.content === 'string'
        ? result.content
        : result.content.toString('utf-8');

      await deliverReply(
        (chunk) => this.send(chatId, chunk),
        replyText,
        { maxChunkSize: 4000 },
      );
    }
  }

  private async apiCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${API_BASE}${this.botToken}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
      signal: this.abortController?.signal,
    });

    if (!res.ok) {
      throw new Error(`Telegram API ${method} failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TelegramResponse<T>;
    if (!data.ok) {
      throw new Error(`Telegram API ${method} error: ${data.description}`);
    }

    return data.result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
