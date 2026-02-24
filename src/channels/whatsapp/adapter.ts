/**
 * WhatsApp channel adapter
 * Receives text DMs via Baileys, parses messages, hands off to ChannelService
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';
import type { OnInboundMessageFn } from '../types.js';
import { BaseChannelAdapter } from '../base-adapter.js';
import { createWhatsAppSocket, type WhatsAppInboundMessage } from './session.js';
import { saveMedia } from '../../lib/media.js';
import { resolveChannelsDir, resolveMediaDir } from '../../config/paths.js';
import { Reconnector } from '../../lib/reconnect.js';

export class WhatsAppAdapter extends BaseChannelAdapter {
  readonly type = 'whatsapp' as const;

  private sock: WASocket | null = null;
  private reconnector = new Reconnector();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authDir = '';
  private lidCache = new Map<string, string>();

  constructor(allowFrom?: string[], onInboundMessage?: OnInboundMessageFn) {
    // WA normalizes phone numbers by stripping leading +
    const normalized = allowFrom?.length
      ? allowFrom.map(p => p.replace(/^\+/, ''))
      : undefined;
    super('whatsapp', normalized, onInboundMessage);
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
          this.log.debug('scan the QR code above with WhatsApp > Linked Devices');
        },
        onConnected: (name) => {
          this.log.debug(`connected as ${name}`);
          this.status = 'connected';
          this.reconnector.reset();
        },
        onDisconnected: (reason) => {
          this.log.debug(`disconnected: ${reason}`);
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
      this.log.error(`failed to start: ${err}`);
      this.scheduleReconnect();
    }
  }

  async stop(): Promise<void> {
    this.cleanupTimers();
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
    this.log.info(`send: ${jid} (${text.length} chars)`);
    await this.sock.sendMessage(this.toJid(jid), { text });
  }

  protected async sendTypingIndicator(recipientId: string): Promise<void> {
    await this.sock?.sendPresenceUpdate('composing', this.toJid(recipientId));
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
        this.log.info(`blocked: ${msg.jid} (phone=${phone})`);
        return;
      }
    }

    if (!msg.text && !msg.mediaType) return;
    if (!this.dedupe.add(msg.messageId)) return;

    if (msg.mediaType) {
      this.log.info(`received ${msg.mediaType} from ${msg.jid}`);
      this.handleMedia(msg).catch((err) => {
        this.log.error(`handleMedia error for ${msg.jid}: ${err}`);
      });
      return;
    }

    this.log.info(`received from ${msg.jid}: ${msg.text.slice(0, 80)}`);
    this.debouncer.push(this.buildUserId(msg.jid), msg.text);
  }

  private buildUserId(jid: string): string {
    return this.resolvePhone(jid);
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
      const mimeDefaults: Record<string, string> = {
        image: 'image/jpeg', audio: 'audio/ogg', video: 'video/mp4', document: 'application/pdf',
      };
      // Strip codec params (e.g. "audio/ogg; codecs=opus" → "audio/ogg")
      const rawMime = msg.mimeType?.split(';')[0].trim();
      const mimeType = rawMime || mimeDefaults[msg.mediaType!] || 'application/octet-stream';
      const savedPath = await saveMedia({ buffer: msg.mediaBuffer, sessionKey, mimeType, mediaDir: resolveMediaDir() });
      const base64 = msg.mediaBuffer.toString('base64');
      const media = { type: msg.mediaType!, data: base64, mimeType, path: savedPath };
      const label = typeLabels[msg.mediaType!] || 'Media';

      if (isImage) {
        const caption = msg.caption || 'User sent an image.';
        const images = [{ data: base64, mimeType }];
        await this.routeToService(userId, `${caption}\n\n[Image saved: ${savedPath}]`, { images, media });
      } else {
        await this.routeToService(userId, `${msg.caption || `${label} received`}\n\n[${label} saved: ${savedPath}]`, { media });
      }
      return;
    }

    // Media without buffer — fallback text
    const label = typeLabels[msg.mediaType!] || 'Media';
    await this.routeToService(userId, msg.caption ? `[${label}] ${msg.caption}` : `[${label} received]`);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnector.next();
    if (delay === null) {
      this.log.debug('max reconnect attempts reached');
      this.status = 'error';
      return;
    }
    this.log.debug(`reconnecting in ${delay}ms (attempt ${this.reconnector.attempts})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.start();
    }, delay);
  }
}
