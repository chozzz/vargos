/**
 * Telegram channel adapter
 * Uses raw fetch against Bot API with long-polling
 * Text-only private chats, no SDK dependency
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { OnInboundMessageFn } from '../types.js';
import type {
  TelegramUpdate,
  TelegramResponse,
  TelegramUser,
  TelegramMessage,
  TelegramFile,
} from './types.js';
import { BaseChannelAdapter } from '../base-adapter.js';
import { saveMedia } from '../../lib/media.js';
import { resolveMediaDir } from '../../config/paths.js';

const API_BASE = 'https://api.telegram.org/bot';
const API_FILE_BASE = 'https://api.telegram.org/file/bot';
const POLL_TIMEOUT_S = 30;
const RECONNECT_DELAY_MS = 5000;

export class TelegramAdapter extends BaseChannelAdapter {
  readonly type = 'telegram' as const;

  private botToken: string;
  private botUser: TelegramUser | null = null;
  private offset = 0;
  private polling = false;
  private abortController: AbortController | null = null;

  constructor(botToken: string, allowFrom?: string[], onInboundMessage?: OnInboundMessageFn) {
    super('telegram', allowFrom, onInboundMessage);
    this.botToken = botToken;
  }

  async initialize(): Promise<void> {
    const me = await this.apiCall<TelegramUser>('getMe');
    this.botUser = me;
    this.log.debug(`bot verified: @${me.username} (${me.first_name})`);
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    this.polling = true;
    this.abortController = new AbortController();
    this.status = 'connected';
    this.log.debug('long-polling started');

    this.pollLoop().catch((err) => {
      this.log.debug(`poll loop exited: ${err}`);
      this.status = 'error';
    });
  }

  async stop(): Promise<void> {
    this.polling = false;
    this.cleanupTimers();
    this.abortController?.abort();
    this.abortController = null;
    this.status = 'disconnected';
    this.log.debug('stopped');
  }

  async send(chatId: string, text: string): Promise<void> {
    await this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
  }

  async sendMedia(recipientId: string, filePath: string, mimeType: string, caption?: string): Promise<void> {
    const [mediaType] = mimeType.split('/');
    const methodMap: Record<string, { method: string; field: string }> = {
      image: { method: 'sendPhoto', field: 'photo' },
      video: { method: 'sendVideo', field: 'video' },
      audio: { method: 'sendAudio', field: 'audio' },
    };
    const { method, field } = methodMap[mediaType] ?? { method: 'sendDocument', field: 'document' };

    const buffer = readFileSync(filePath);
    const fileName = path.basename(filePath);
    const blob = new Blob([buffer], { type: mimeType });

    const form = new FormData();
    form.append('chat_id', recipientId);
    form.append(field, blob, fileName);
    if (caption) form.append('caption', caption);

    const url = `${API_BASE}${this.botToken}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      signal: this.abortController?.signal,
    });

    if (!res.ok) {
      throw new Error(`Telegram API ${method} failed: ${res.status} ${res.statusText}`);
    }
    this.log.debug(`sendMedia: ${recipientId} ${mimeType} ${fileName}`);
  }

  protected async sendTypingIndicator(recipientId: string): Promise<void> {
    await this.apiCall('sendChatAction', { chat_id: recipientId, action: 'typing' });
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
        this.log.debug(`poll error: ${err}`);
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
        this.log.debug(`handleMedia error for ${chatId}: ${err}`);
      });
      return;
    }

    this.log.debug(`received from ${chatId}: ${msg.text!.slice(0, 80)}`);
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

    // Photo — pick largest (last in array)
    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1];
      this.log.debug(`received photo from ${chatId}`);

      try {
        const buffer = await this.downloadFile(largest.file_id);
        const mimeType = 'image/jpeg';
        const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir: resolveMediaDir() });
        const base64 = buffer.toString('base64');
        const caption = msg.caption || 'User sent an image.';
        const images = [{ data: base64, mimeType }];
        const media = { type: 'image', data: base64, mimeType, path: savedPath };
        await this.routeToService(chatId, `${caption}\n\n[Image saved: ${savedPath}]`, { images, media });
      } catch (err) {
        this.log.debug(`photo download failed for ${chatId}: ${err}`);
      }
      return;
    }

    // Voice / audio
    const fileId = msg.voice?.file_id ?? msg.audio?.file_id;
    // Strip codec params (e.g. "audio/ogg; codecs=opus" → "audio/ogg")
    const rawMime = (msg.voice?.mime_type ?? msg.audio?.mime_type)?.split(';')[0].trim();
    const mimeType = rawMime || 'audio/ogg';
    const duration = msg.voice?.duration ?? msg.audio?.duration;
    const label = msg.voice ? 'Voice message' : 'Audio message';

    this.log.debug(`received ${label.toLowerCase()} from ${chatId} (${duration}s)`);

    try {
      const buffer = await this.downloadFile(fileId!);
      const savedPath = await saveMedia({ buffer, sessionKey, mimeType, mediaDir: resolveMediaDir() });
      const base64 = buffer.toString('base64');
      const media = { type: 'audio', data: base64, mimeType, path: savedPath };
      await this.routeToService(chatId, `${msg.caption || `[${label}, ${duration}s]`}\n\n[${label} saved: ${savedPath}]`, { media });
    } catch (err) {
      this.log.debug(`audio download failed for ${chatId}: ${err}`);
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
