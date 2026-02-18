/**
 * Telegram channel adapter
 * Uses raw fetch against Bot API with long-polling
 * Text-only private chats, no SDK dependency
 */

import type { ChannelAdapter, ChannelStatus, GatewayCallFn } from '../types.js';
import type {
  TelegramUpdate,
  TelegramResponse,
  TelegramUser,
  TelegramMessage,
  TelegramFile,
} from './types.js';
import { createDedupeCache } from '../../lib/dedupe.js';
import { createMessageDebouncer } from '../../lib/debounce.js';
import { saveMedia } from '../../lib/media.js';
import { resolveMediaDir } from '../../config/paths.js';
import { deliverReply } from '../delivery.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('telegram');

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
  private gatewayCall?: GatewayCallFn;

  constructor(botToken: string, allowFrom?: string[], gatewayCall?: GatewayCallFn) {
    this.botToken = botToken;
    this.allowFrom = allowFrom?.length ? new Set(allowFrom) : null;
    this.gatewayCall = gatewayCall;
    this.debouncer = createMessageDebouncer(
      (chatId, messages) => {
        this.handleBatch(chatId, messages).catch((err) => {
          log.debug(`handleBatch error for ${chatId}: ${err}`);
        });
      },
      { delayMs: 1500 },
    );
  }

  async initialize(): Promise<void> {
    const me = await this.apiCall<TelegramUser>('getMe');
    this.botUser = me;
    log.debug(`bot verified: @${me.username} (${me.first_name})`);
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    this.polling = true;
    this.abortController = new AbortController();
    this.status = 'connected';
    log.debug('long-polling started');

    this.pollLoop().catch((err) => {
      log.debug(`poll loop exited: ${err}`);
      this.status = 'error';
    });
  }

  async stop(): Promise<void> {
    this.polling = false;
    this.debouncer.cancelAll();
    this.abortController?.abort();
    this.abortController = null;
    this.status = 'disconnected';
    log.debug('stopped');
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
        if (!this.polling) break;
        log.debug(`poll error: ${err}`);
        await sleep(RECONNECT_DELAY_MS);
      }
    }
  }

  private handleUpdate(update: TelegramUpdate): void {
    const msg = update.message;
    if (!msg) return;

    if (!msg.text && !msg.photo && !msg.voice && !msg.audio) return;
    if (msg.chat.type !== 'private') return;
    if (msg.from?.id === this.botUser?.id) return;
    if (this.allowFrom && !this.allowFrom.has(String(msg.chat.id))) return;

    const msgKey = `${msg.chat.id}:${msg.message_id}`;
    if (!this.dedupe.add(msgKey)) return;

    const chatId = String(msg.chat.id);

    if (msg.photo || msg.voice || msg.audio) {
      this.handleMedia(chatId, msg).catch((err) => {
        log.debug(`handleMedia error for ${chatId}: ${err}`);
      });
      return;
    }

    log.debug(`received from ${chatId}: ${msg.text!.slice(0, 80)}`);
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

  private async runViaGateway(params: {
    sessionKey: string;
    chatId: string;
    content: string;
    channel: string;
    images?: Array<{ data: string; mimeType: string }>;
  }): Promise<void> {
    if (!this.gatewayCall) {
      log.error('No gateway connection — cannot process message');
      return;
    }

    // Create session (idempotent)
    await this.gatewayCall('sessions', 'session.create', {
      sessionKey: params.sessionKey,
      kind: 'main',
      metadata: { channel: params.channel },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) throw err;
    });

    // Store user message
    await this.gatewayCall('sessions', 'session.addMessage', {
      sessionKey: params.sessionKey,
      content: params.content,
      role: 'user',
      metadata: { type: 'task', channel: params.channel },
    });

    // Typing indicator
    const typing = async () => {
      await this.apiCall('sendChatAction', { chat_id: params.chatId, action: 'typing' });
    };
    typing().catch(() => {});
    const typingInterval = setInterval(() => typing().catch(() => {}), 4000);

    try {
      const result = await this.gatewayCall<{ success: boolean; response?: string; error?: string }>(
        'agent', 'agent.run', {
          sessionKey: params.sessionKey,
          task: params.content,
          channel: params.channel,
          images: params.images,
        },
      );

      if (result.success && result.response) {
        await deliverReply((chunk) => this.send(params.chatId, chunk), result.response);
      } else if (!result.success) {
        await this.send(params.chatId, `[error] ${result.error || 'Agent run failed'}`).catch(() => {});
      }
    } finally {
      clearInterval(typingInterval);
    }
  }

  private async handleMedia(chatId: string, msg: TelegramMessage): Promise<void> {
    const sessionKey = `telegram:${chatId}`;

    // Photo — pick largest (last in array)
    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1];
      log.debug(`received photo from ${chatId}`);

      try {
        const buffer = await this.downloadFile(largest.file_id);
        const mimeType = 'image/jpeg';
        const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir: resolveMediaDir() });
        const caption = msg.caption || 'User sent an image.';
        const images = [{ data: buffer.toString('base64'), mimeType }];
        await this.runViaGateway({
          sessionKey, chatId,
          content: `${caption}\n\n[Image saved: ${savedPath}]`,
          channel: 'telegram', images,
        });
      } catch (err) {
        log.debug(`photo download failed for ${chatId}: ${err}`);
      }
      return;
    }

    // Voice / audio
    const fileId = msg.voice?.file_id ?? msg.audio?.file_id;
    const mimeType = msg.voice?.mime_type ?? msg.audio?.mime_type ?? 'audio/ogg';
    const duration = msg.voice?.duration ?? msg.audio?.duration;
    const label = msg.voice ? 'Voice message' : 'Audio message';

    log.debug(`received ${label.toLowerCase()} from ${chatId} (${duration}s)`);

    try {
      const buffer = await this.downloadFile(fileId!);
      const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir: resolveMediaDir() });
      await this.runViaGateway({
        sessionKey, chatId,
        content: `${msg.caption || `[${label}, ${duration}s]`}\n\n[${label} saved: ${savedPath}]`,
        channel: 'telegram',
      });
    } catch (err) {
      log.debug(`audio download failed for ${chatId}: ${err}`);
    }
  }

  private async handleBatch(chatId: string, messages: string[]): Promise<void> {
    const text = messages.join('\n');
    const sessionKey = `telegram:${chatId}`;
    log.debug(`batch for ${sessionKey}: "${text.slice(0, 80)}"`);
    await this.runViaGateway({ sessionKey, chatId, content: text, channel: 'telegram' });
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
