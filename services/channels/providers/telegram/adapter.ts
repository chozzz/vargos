/**
 * Telegram channel adapter — long-polling, IPv4-forced, no SDK dependency
 */

import https from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { InboundMediaSource } from '../../types.js';
import type { NormalizedInboundMessage, AdapterDeps } from '../../contracts.js';
import type {
  TelegramUpdate,
  TelegramResponse,
  TelegramUser,
  TelegramMessage,
  TelegramFile,
} from './types.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
import { normalizeTelegramMessage } from './normalizer.js';
import { sleep } from '../../../../lib/sleep.js';
import { validateHttpResponse } from '../../../../lib/http-validate.js';
import { Reconnector } from '../../reconnect.js';

const API_BASE = 'https://api.telegram.org/bot';
const API_FILE_BASE = 'https://api.telegram.org/file/bot';
const POLL_TIMEOUT_S = 30;

interface FetchLike {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  buffer(): Promise<Buffer>;
}

export class TelegramAdapter extends BaseChannelAdapter {
  readonly type = 'telegram' as const;

  private botUser: TelegramUser | null = null;
  private offset = 0;
  private polling = false;
  private abortController: AbortController | null = null;
  private reconnector = new Reconnector();

  constructor(
    instanceId: string,
    private readonly botToken: string,
    deps: AdapterDeps,
  ) {
    super(instanceId, 'telegram', deps);
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
    this.log.debug(`long-polling started for ${this.instanceId}`);

    this.pollLoop().catch((err) => {
      this.log.error(`poll loop exited: ${err}`);
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

    validateHttpResponse(res, `Telegram ${method}`);
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
    this.log.debug(`poll loop starting with offset ${this.offset}`);
    let cycleCount = 0;
    while (this.polling) {
      try {
        cycleCount++;
        this.log.debug(`poll cycle ${cycleCount}: calling getUpdates with offset ${this.offset}`);
        const updates = await this.apiCall<TelegramUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: POLL_TIMEOUT_S,
          allowed_updates: ['message'],
        });

        this.log.debug(`poll cycle ${cycleCount}: received response with ${updates.length} update(s)`);
        this.reconnector.reset();

        for (const update of updates) {
          this.offset = update.update_id + 1;
          this.handleUpdate(update);
        }
      } catch (err) {
        if (!this.polling) break;
        this.log.warn(`poll error (cycle ${cycleCount}): ${err}`);
        const delay = this.reconnector.next();
        if (delay === null) {
          this.log.error('max reconnect attempts reached');
          this.status = 'error';
          break;
        }
        await sleep(delay);
      }
    }
  }

  private handleUpdate(update: TelegramUpdate): void {
    const msg = update.message;
    if (!msg) return;

    const normalizedMsg = normalizeTelegramMessage(msg, { botUserId: this.botUser?.id || null });
    if (!normalizedMsg) {
      this.log.error(`${msg.chat.type} message from user ${msg.from?.id} not normalized`);
      return;
    }

    const chatId = String(msg.chat.id);
    const msgKey = `${chatId}:${msg.message_id}`;
    if (!this.dedupe.add(msgKey)) return;

    if (msg.photo || msg.voice || msg.audio || msg.document) {
      this.debouncer.flush(chatId);
      this.log.debug(`${msg.chat.type} media from user ${normalizedMsg.fromUserId}`);
      this.handleMedia(chatId, msg, normalizedMsg).catch((err) => {
        this.log.warn(`handleMedia error for ${normalizedMsg.fromUserId}: ${err}`);
      });
      return;
    }

    this.log.debug(`${msg.chat.type} text from user ${normalizedMsg.fromUserId}: ${msg.text!.slice(0, 80)}`);
    this.latestMessageId.set(chatId, String(msg.message_id));
    this.debouncer.push(chatId, msg.text!, normalizedMsg);
  }

  private isMentioned(msg: TelegramMessage): boolean {
    if (!msg.text || !this.botUser) return false;
    const botUsername = this.botUser.username;
    if (botUsername && msg.text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
      return true;
    }
    // Also check if it's a reply to the bot's message
    if (msg.reply_to_message?.from?.id === this.botUser.id) {
      return true;
    }
    return false;
  }


  private async downloadFile(fileId: string): Promise<Buffer> {
    const file = await this.apiCall<TelegramFile>('getFile', { file_id: fileId });
    if (!file.file_path) throw new Error('No file_path returned from getFile');

    const url = `${API_FILE_BASE}${this.botToken}/${file.file_path}`;
    const res = await this.request(url, { method: 'GET' });
    validateHttpResponse(res, 'File download');
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

    if (tgMsg.document) {
      const buffer = await this.downloadFile(tgMsg.document.file_id);
      const mimeType = tgMsg.document.mime_type || 'application/octet-stream';
      const caption = tgMsg.caption || `[Document: ${tgMsg.document.file_name}]`;
      return { buffer, mimeType, mediaType: 'document', caption };
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

  private async handleMedia(chatId: string, msg: TelegramMessage, normalizedMsg: NormalizedInboundMessage): Promise<void> {
    if (!this.onInboundMessage) {
      this.log.error('No inbound message handler');
      return;
    }

    const sessionKey = this.buildSessionKey(chatId);
    const label = msg.photo?.length ? 'photo' : (msg.voice ? 'voice' : msg.audio ? 'audio' : 'document');
<<<<<<< HEAD
    this.log.debug(`received ${label} from ${chatId}`);
=======
>>>>>>> 8d94e07 (feat: add document media support with normalized validation)

    try {
      const { caption, savedPath, mimeType } = await this.processInboundMedia(
        { tgMsg: msg, chatId },
        sessionKey,
        normalizedMsg,
        (text) => this.onInboundMessage!(sessionKey, { ...normalizedMsg, text }),
      );
      this.log.debug(`received ${label} from ${chatId}: ${caption} - ${savedPath}`);
    } catch (err) {
      this.log.warn(`${label} download failed for ${chatId}: ${err}`);
    }
  }

  private async apiCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${API_BASE}${this.botToken}/${method}`;
    const body = params ? JSON.stringify(params) : undefined;
    const res = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, body ? Buffer.from(body) : undefined);

    validateHttpResponse(res, `Telegram API ${method}`);

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
