/**
 * Telegram channel adapter — long-polling, IPv4-forced, no SDK dependency
 */

import https from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { InboundMediaSource, NormalizedInboundMessage, AdapterDeps } from '../../types.js';
import type {
  TelegramUpdate,
  TelegramResponse,
  TelegramUser,
  TelegramMessage,
  TelegramFile,
} from './types.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
import { normalizeTelegramMessage } from './normalizer.js';
import { sleep } from '../../../../lib/util.js';
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

export class TelegramAdapter extends BaseChannelAdapter<TelegramMessage> {
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
    super(instanceId, deps);
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
    this.cleanup();
    this.abortController?.abort();
    this.abortController = null;
    this.status = 'disconnected';
    this.log.debug('stopped');
  }

  protected normalize(msg: TelegramMessage): NormalizedInboundMessage | null {
    return normalizeTelegramMessage(msg, {
      botUserId: this.botUser?.id || null,
      botUsername: this.botUser?.username,
    });
  }

  protected async sendText(chatId: string, text: string): Promise<void> {
    await this.apiCall('sendMessage', { chat_id: chatId, text });
  }

  protected async sendTyping(chatId: string): Promise<void> {
    await this.apiCall('sendChatAction', { chat_id: chatId, action: 'typing' });
  }

  async react(sessionKey: string, messageId: string, emoji: string): Promise<void> {
    await this.apiCall('setMessageReaction', {
      chat_id: this.chatId(sessionKey),
      message_id: Number(messageId),
      reaction: [{ type: 'emoji', emoji }],
    });
  }

  async sendMedia(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void> {
    const chatId = this.chatId(sessionKey);
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

  protected async resolveMedia(msg: TelegramMessage): Promise<InboundMediaSource | null> {
    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1];
      return { buffer: await this.downloadFile(largest.file_id), mimeType: 'image/jpeg', caption: msg.caption };
    }

    if (msg.document) {
      const buffer = await this.downloadFile(msg.document.file_id);
      const mimeType = msg.document.mime_type || 'application/octet-stream';
      return { buffer, mimeType, caption: msg.caption || `[Document: ${msg.document.file_name}]` };
    }

    const audio = msg.voice ?? msg.audio;
    if (!audio) return null;

    const duration = audio.duration;
    const label = msg.voice ? 'Voice message' : 'Audio message';
    return {
      buffer: await this.downloadFile(audio.file_id),
      mimeType: audio.mime_type?.split(';')[0].trim() || 'audio/ogg',
      caption: msg.caption || `[${label}, ${duration}s]`,
      duration,
    };
  }

  private async pollLoop(): Promise<void> {
    this.log.debug(`poll loop starting with offset ${this.offset}`);
    while (this.polling) {
      try {
        const updates = await this.apiCall<TelegramUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: POLL_TIMEOUT_S,
          allowed_updates: ['message'],
        });

        this.reconnector.reset();

        for (const update of updates) {
          this.offset = update.update_id + 1;
          if (update.message) void this.receive(update.message);
        }
      } catch (err) {
        if (!this.polling) break;
        this.log.warn(`poll error: ${err}`);
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

  private async downloadFile(fileId: string): Promise<Buffer> {
    const file = await this.apiCall<TelegramFile>('getFile', { file_id: fileId });
    if (!file.file_path) throw new Error('No file_path returned from getFile');

    const res = await this.request(`${API_FILE_BASE}${this.botToken}/${file.file_path}`, { method: 'GET' });
    validateHttpResponse(res, 'File download');
    return res.buffer();
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
