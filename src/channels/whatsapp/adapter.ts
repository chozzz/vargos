/**
 * WhatsApp channel adapter
 * Receives text DMs via Baileys, parses messages, hands off to ChannelService
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';
import type { ChannelAdapter, ChannelStatus, OnInboundMessageFn } from '../types.js';
import { createWhatsAppSocket, type WhatsAppInboundMessage } from './session.js';
import { createDedupeCache } from '../../lib/dedupe.js';
import { createMessageDebouncer } from '../../lib/debounce.js';
import { saveMedia } from '../../lib/media.js';
import { resolveChannelsDir, resolveMediaDir } from '../../config/paths.js';
import { Reconnector } from '../../lib/reconnect.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('whatsapp');

export class WhatsAppAdapter implements ChannelAdapter {
  readonly type = 'whatsapp' as const;
  status: ChannelStatus = 'disconnected';

  private sock: WASocket | null = null;
  private dedupe = createDedupeCache({ ttlMs: 120_000 });
  private debouncer: ReturnType<typeof createMessageDebouncer>;
  private reconnector = new Reconnector();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private allowFrom: Set<string> | null;
  private authDir = '';
  private lidCache = new Map<string, string>();
  private onInboundMessage?: OnInboundMessageFn;
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(allowFrom?: string[], onInboundMessage?: OnInboundMessageFn) {
    this.allowFrom = allowFrom?.length
      ? new Set(allowFrom.flatMap(p => [p, p.replace(/^\+/, '')]))
      : null;
    this.onInboundMessage = onInboundMessage;
    this.debouncer = createMessageDebouncer(
      (jid, messages) => {
        this.handleBatch(jid, messages).catch((err) => {
          log.error(`handleBatch error for ${jid}: ${err}`);
        });
      },
      { delayMs: 1500 },
    );
  }

  async initialize(): Promise<void> {
    // Auth state dir created on start
  }

  async start(): Promise<void> {
    if (this.sock) {
      try { this.sock.end(undefined); } catch { /* already closed */ }
      this.sock = null;
    }

    this.status = 'connecting';
    this.authDir = path.join(resolveChannelsDir(), 'whatsapp');

    try {
      this.sock = await createWhatsAppSocket(this.authDir, {
        onQR: () => {
          log.debug('scan the QR code above with WhatsApp > Linked Devices');
        },
        onConnected: (name) => {
          log.debug(`connected as ${name}`);
          this.status = 'connected';
          this.reconnector.reset();
        },
        onDisconnected: (reason) => {
          log.debug(`disconnected: ${reason}`);
          this.sock = null;
          if (reason === 'logged_out' || reason === 'forbidden') {
            this.status = 'error';
            return;
          }
          this.status = 'disconnected';
          this.scheduleReconnect();
        },
        onMessage: (msg) => this.handleInbound(msg),
      });
    } catch (err) {
      this.status = 'error';
      log.error(`failed to start: ${err}`);
      this.scheduleReconnect();
    }
  }

  async stop(): Promise<void> {
    this.debouncer.cancelAll();
    for (const interval of this.typingIntervals.values()) clearInterval(interval);
    this.typingIntervals.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
    this.status = 'disconnected';
  }

  async send(jid: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    log.info(`send: ${jid} (${text.length} chars)`);
    await this.sock.sendMessage(this.toJid(jid), { text });
  }

  startTyping(recipientId: string): void {
    if (this.typingIntervals.has(recipientId)) return;
    const jid = this.toJid(recipientId);
    const typing = () => this.sock?.sendPresenceUpdate('composing', jid).catch(() => {});
    typing();
    this.typingIntervals.set(recipientId, setInterval(typing, 4000));
  }

  stopTyping(recipientId: string): void {
    const interval = this.typingIntervals.get(recipientId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(recipientId);
    }
  }

  /** Normalize a phone number or raw JID into a valid WhatsApp JID */
  private toJid(id: string): string {
    if (id.includes('@')) return id;
    return `${id.replace(/^\+/, '')}@s.whatsapp.net`;
  }

  /**
   * Resolve a JID to a phone number.
   * Baileys v7 uses LID format (opaque@lid) instead of phone@s.whatsapp.net.
   * LID->phone mappings are stored in the auth dir by Baileys.
   */
  private resolvePhone(jid: string): string {
    if (jid.endsWith('@s.whatsapp.net')) {
      return jid.replace('@s.whatsapp.net', '');
    }
    if (jid.endsWith('@lid')) {
      const lid = jid.replace('@lid', '');
      return this.lidToPhone(lid);
    }
    return jid;
  }

  private lidToPhone(lid: string): string {
    const cached = this.lidCache.get(lid);
    if (cached) return cached;
    try {
      const file = path.join(this.authDir, `lid-mapping-${lid}_reverse.json`);
      const phone = JSON.parse(readFileSync(file, 'utf-8')) as string;
      this.lidCache.set(lid, phone);
      return phone;
    } catch {
      return lid;
    }
  }

  private handleInbound(msg: WhatsAppInboundMessage): void {
    if (msg.fromMe || msg.isGroup) return;

    if (this.allowFrom) {
      const phone = this.resolvePhone(msg.jid);
      if (!this.allowFrom.has(phone)) {
        log.info(`blocked: ${msg.jid} (phone=${phone})`);
        return;
      }
    }

    if (!msg.text && !msg.mediaType) return;
    if (!this.dedupe.add(msg.messageId)) return;

    if (msg.mediaType) {
      log.info(`received ${msg.mediaType} from ${msg.jid}`);
      this.handleMedia(msg).catch((err) => {
        log.error(`handleMedia error for ${msg.jid}: ${err}`);
      });
      return;
    }

    log.info(`received from ${msg.jid}: ${msg.text.slice(0, 80)}`);
    this.debouncer.push(msg.jid, msg.text);
  }

  private buildUserId(jid: string): string {
    return this.resolvePhone(jid);
  }

  private async routeToService(userId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.onInboundMessage) {
      log.error('No inbound message handler — cannot process message');
      return;
    }
    await this.onInboundMessage('whatsapp', userId, content, metadata);
  }

  private async handleMedia(msg: WhatsAppInboundMessage): Promise<void> {
    const userId = this.buildUserId(msg.jid);
    const sessionKey = `whatsapp:${userId}`;

    const typeLabels: Record<string, string> = {
      audio: 'Voice message', video: 'Video message',
      document: 'Document', sticker: 'Sticker',
    };

    if (msg.mediaBuffer) {
      const isImage = msg.mediaType === 'image';
      const mimeType = msg.mimeType || (isImage ? 'image/jpeg' : 'application/octet-stream');
      const savedPath = await saveMedia({ buffer: msg.mediaBuffer, sessionKey, mimeType, mediaDir: resolveMediaDir() });

      if (isImage) {
        const caption = msg.caption || 'User sent an image.';
        const images = [{ data: msg.mediaBuffer.toString('base64'), mimeType }];
        await this.routeToService(userId, `${caption}\n\n[Image saved: ${savedPath}]`, { images });
      } else {
        const label = typeLabels[msg.mediaType!] || 'Media';
        await this.routeToService(userId, `${msg.caption || `${label} received`}\n\n[${label} saved: ${savedPath}]`);
      }
      return;
    }

    // Media without buffer — fallback text
    const label = typeLabels[msg.mediaType!] || 'Media';
    await this.routeToService(userId, msg.caption ? `[${label}] ${msg.caption}` : `[${label} received]`);
  }

  private async handleBatch(jid: string, messages: string[]): Promise<void> {
    const text = messages.join('\n');
    const userId = this.buildUserId(jid);
    log.info(`batch for whatsapp:${userId}: "${text.slice(0, 80)}"`);
    await this.routeToService(userId, text);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnector.next();
    if (delay === null) {
      log.debug('max reconnect attempts reached');
      this.status = 'error';
      return;
    }
    log.debug(`reconnecting in ${delay}ms (attempt ${this.reconnector.attempts})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.start();
    }, delay);
  }
}
