/**
 * Telegram channel adapter — long-polling, IPv4-forced, no SDK dependency
 */

import https from 'node:https';
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
import { InboundMediaHandler, type InboundMediaSource } from '../media-handler.js';
import { sleep } from '../../../lib/sleep.js';

const API_BASE = 'https://api.telegram.org/bot';
const API_FILE_BASE = 'https://api.telegram.org/file/bot';
const POLL_TIMEOUT_S = 30;
const RECONNECT_DELAY_MS = 5000;

interface FetchLike {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  buffer(): Promise<Buffer>;
}

export class TelegramAdapter extends InboundMediaHandler {
  readonly type = 'telegram' as const;

  private botUser: TelegramUser | null = null;
  private offset = 0;
  private polling = false;
  private abortController: AbortController | null = null;
  private latestMessageId = new Map<string, string>();

  constructor(
    instanceId: string,
    private readonly botToken: string,
    allowFrom?: string[],
    onInboundMessage?: OnInboundMessageFn,
    debounceMs?: number,
  ) {
    super(instanceId, 'telegram', allowFrom, onInboundMessage, debounceMs);
  }

  async start(): Promise<void> {
    // Init: verify bot identity
    const me = await this.apiCall<TelegramUser>('getMe');
    this.botUser = me;
    this.log.debug(`bot verified: @${me.username} (${me.first_name})`);

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

  async send(sessionKey: string, text: string): Promise<void> {
    const chatId = this.extractUserId(sessionKey);
    await this.apiCall('sendMessage', { chat_id: chatId, text });
  }

  async sendMedia(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void> {
    const chatId = this.extractUserId(sessionKey);
    const [mediaType] = mimeType.split('/');
    const methodMap: Record<string, { method: string; field: string }> = {
      image: { method: 'sendPhoto', field: 'photo' },
      video: { method: 'sendVideo', field: 'video' },
      audio: { method: 'sendAudio', field: 'audio' },
    };
    const { method, field } = methodMap[mediaType] ?? { method: 'sendDocument', field: 'document' };

    const fileBuffer = readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = `----TelegramBoundary${Date.now()}`;

    const parts: Buffer[] = [];
    const addField = (name: string, value: string) => {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ));
    };
    addField('chat_id', chatId);
    if (caption) addField('caption', caption);
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const url = `${API_BASE}${this.botToken}/${method}`;
    const res = await this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
    }, body);

    if (!res.ok) throw new Error(`Telegram ${method} failed: ${res.status} ${res.statusText}`);
    this.log.debug(`sendMedia: ${sessionKey} ${mimeType} ${fileName}`);
  }

  protected async sendTypingIndicator(sessionKey: string): Promise<void> {
    const chatId = this.extractUserId(sessionKey);
    await this.apiCall('sendChatAction', { chat_id: chatId, action: 'typing' });
  }

  async react(sessionKey: string, messageId: string, emoji: string): Promise<void> {
    const chatId = this.extractUserId(sessionKey);
    await this.apiCall('setMessageReaction', {
      chat_id: chatId,
      message_id: Number(messageId),
      reaction: [{ type: 'emoji', emoji }],
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
      this.debouncer.flush(chatId);
      this.handleMedia(chatId, msg).catch((err) => {
        this.log.debug(`handleMedia error for ${chatId}: ${err}`);
      });
      return;
    }

    this.log.debug(`received from ${chatId}: ${msg.text!.slice(0, 80)}`);
    this.latestMessageId.set(chatId, String(msg.message_id));
    this.debouncer.push(chatId, msg.text!);
  }

  protected override async handleBatch(id: string, messages: string[]): Promise<void> {
    const messageId = this.latestMessageId.get(id);
    const text = messages.join('\n');
    const sessionKey = `${this.instanceId}:${id}`;
    this.log.debug(`batch for ${sessionKey}: "${text.slice(0, 80)}"`);
    await this.routeToService(sessionKey, text, messageId ? { messageId } : undefined);
  }

  private async downloadFile(fileId: string): Promise<Buffer> {
    const file = await this.apiCall<TelegramFile>('getFile', { file_id: fileId });
    if (!file.file_path) throw new Error('No file_path returned from getFile');

    const url = `${API_FILE_BASE}${this.botToken}/${file.file_path}`;
    const res = await this.request(url, { method: 'GET' });
    if (!res.ok) throw new Error(`File download failed: ${res.status}`);
    return res.buffer();
  }

  protected async resolveMedia(msg: unknown): Promise<InboundMediaSource | null> {
    const m = msg as { tgMsg: TelegramMessage; chatId: string };
    const { tgMsg } = m;

    if (tgMsg.photo?.length) {
      const largest = tgMsg.photo[tgMsg.photo.length - 1];
      const buffer = await this.downloadFile(largest.file_id);
      return { buffer, mimeType: 'image/jpeg', mediaType: 'image', caption: tgMsg.caption };
    }

    const fileId = tgMsg.voice?.file_id ?? tgMsg.audio?.file_id;
    if (!fileId) return null;

    const rawMime = (tgMsg.voice?.mime_type ?? tgMsg.audio?.mime_type)?.split(';')[0].trim();
    const mimeType = rawMime || 'audio/ogg';
    const duration = tgMsg.voice?.duration ?? tgMsg.audio?.duration;
    const label = tgMsg.voice ? 'Voice message' : 'Audio message';
    const caption = tgMsg.caption || `[${label}, ${duration}s]`;
    const buffer = await this.downloadFile(fileId);
    return { buffer, mimeType, mediaType: 'audio', caption, duration };
  }

  private async handleMedia(chatId: string, msg: TelegramMessage): Promise<void> {
    const sessionKey = `${this.instanceId}:${chatId}`;
    const label = msg.photo?.length ? 'photo' : (msg.voice ? 'voice' : 'audio');
    this.log.debug(`received ${label} from ${chatId}`);

    try {
      await this.processInboundMedia(
        { tgMsg: msg, chatId },
        chatId,
        sessionKey,
        (text, metadata) => this.routeToService(sessionKey, text, { ...metadata, messageId: String(msg.message_id) }),
      );
    } catch (err) {
      this.log.debug(`${label} download failed for ${chatId}: ${err}`);
    }
  }

  private async apiCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${API_BASE}${this.botToken}/${method}`;
    const body = params ? JSON.stringify(params) : undefined;
    const res = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, body ? Buffer.from(body) : undefined);

    if (!res.ok) throw new Error(`Telegram API ${method} failed: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as TelegramResponse<T>;
    if (!data.ok) throw new Error(`Telegram API ${method} error: ${data.description}`);

    return data.result;
  }

  /**
   * https.request wrapper forcing IPv4 — avoids Node.js fetch Happy Eyeballs IPv6 ETIMEDOUT
   */
  private request(
    url: string,
    options: { method?: string; headers?: Record<string, string> },
    body?: Buffer,
  ): Promise<FetchLike> {
    return new Promise((resolve, reject) => {
      const signal = this.abortController?.signal;
      if (signal?.aborted) return reject(new Error('aborted'));

      const parsed = new URL(url);
      const req = https.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: parsed.pathname + parsed.search,
          method: options.method ?? 'GET',
          headers: options.headers,
          family: 4,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            resolve({
              ok: res.statusCode! >= 200 && res.statusCode! < 300,
              status: res.statusCode!,
              statusText: res.statusMessage ?? '',
              json: () => Promise.resolve(JSON.parse(buf.toString('utf-8'))),
              buffer: () => Promise.resolve(buf),
            });
          });
          res.on('error', reject);
        },
      );

      req.on('error', reject);

      const onAbort = () => req.destroy(new Error('aborted'));
      signal?.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => signal?.removeEventListener('abort', onAbort));

      if (body) req.write(body);
      req.end();
    });
  }
}
