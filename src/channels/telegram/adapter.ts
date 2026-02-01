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
  TelegramMessage,
  TelegramFile,
} from './types.js';
import { createDedupeCache } from '../../lib/dedupe.js';
import { createMessageDebouncer } from '../../lib/debounce.js';
import { processAndDeliver, type NormalizedInput, type GatewayContext } from '../../gateway/core.js';

const API_BASE = 'https://api.telegram.org/bot';
const API_FILE_BASE = 'https://api.telegram.org/file/bot';
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
  private allowFrom: Set<string> | null;

  constructor(botToken: string, allowFrom?: string[]) {
    this.botToken = botToken;
    this.allowFrom = allowFrom?.length ? new Set(allowFrom) : null;
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
    if (!msg) return;

    // Must have text, photo, or voice
    if (!msg.text && !msg.photo && !msg.voice && !msg.audio) return;

    // Skip non-private chats
    if (msg.chat.type !== 'private') return;

    // Skip bot's own messages
    if (msg.from?.id === this.botUser?.id) return;

    // Whitelist filter
    if (this.allowFrom && !this.allowFrom.has(String(msg.chat.id))) return;

    const msgKey = `${msg.chat.id}:${msg.message_id}`;
    if (!this.dedupe.add(msgKey)) return;

    const chatId = String(msg.chat.id);

    // Media messages bypass debouncer
    if (msg.photo || msg.voice || msg.audio) {
      this.handleMedia(chatId, msg).catch((err) => {
        console.error(`[Telegram] handleMedia error for ${chatId}:`, err);
      });
      return;
    }

    console.error(`[Telegram] Received from ${chatId}: ${msg.text!.slice(0, 80)}`);
    this.debouncer.push(chatId, msg.text!);
  }

  private async downloadFile(fileId: string): Promise<Buffer> {
    const file = await this.apiCall<TelegramFile>('getFile', { file_id: fileId });
    if (!file.file_path) throw new Error('No file_path returned from getFile');

    const url = `${API_FILE_BASE}${this.botToken}/${file.file_path}`;
    const res = await fetch(url, { signal: this.abortController?.signal });
    if (!res.ok) throw new Error(`File download failed: ${res.status}`);

    return Buffer.from(await res.arrayBuffer());
  }

  private async handleMedia(chatId: string, msg: TelegramMessage): Promise<void> {
    const sessionKey = `telegram:${chatId}`;

    const context: GatewayContext = {
      sessionKey,
      userId: chatId,
      channel: 'telegram',
      permissions: ['*'],
      metadata: {},
    };

    const send = (chunk: string) => this.send(chatId, chunk);

    // Photo — pick largest (last in array), send as image input
    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1];
      console.error(`[Telegram] Received photo from ${chatId}`);

      try {
        const buffer = await this.downloadFile(largest.file_id);
        const input: NormalizedInput = {
          type: 'image',
          content: buffer,
          metadata: { mimeType: 'image/jpeg', caption: msg.caption },
          source: { channel: 'telegram', userId: chatId, sessionKey },
          timestamp: Date.now(),
        };
        const typing = async () => { await this.apiCall('sendChatAction', { chat_id: chatId, action: 'typing' }); };
        await processAndDeliver(input, context, send, typing);
      } catch (err) {
        console.error(`[Telegram] Photo download failed for ${chatId}:`, err);
      }
      return;
    }

    // Voice / audio — download and forward buffer
    const fileId = msg.voice?.file_id ?? msg.audio?.file_id;
    const mimeType = msg.voice?.mime_type ?? msg.audio?.mime_type ?? 'audio/ogg';
    const duration = msg.voice?.duration ?? msg.audio?.duration;
    const label = msg.voice ? 'Voice message' : 'Audio message';

    console.error(`[Telegram] Received ${label.toLowerCase()} from ${chatId} (${duration}s)`);

    try {
      const buffer = await this.downloadFile(fileId!);
      const input: NormalizedInput = {
        type: 'voice',
        content: buffer,
        metadata: { mimeType, caption: msg.caption || `[${label}, ${duration}s]` },
        source: { channel: 'telegram', userId: chatId, sessionKey },
        timestamp: Date.now(),
      };
      const typing = async () => { await this.apiCall('sendChatAction', { chat_id: chatId, action: 'typing' }); };
      await processAndDeliver(input, context, send, typing);
    } catch (err) {
      console.error(`[Telegram] Audio download failed for ${chatId}:`, err);
    }
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

    const typing = async () => { await this.apiCall('sendChatAction', { chat_id: chatId, action: 'typing' }); };
    await processAndDeliver(input, context, (chunk) => this.send(chatId, chunk), typing);
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
