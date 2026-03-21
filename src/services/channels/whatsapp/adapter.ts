/**
 * WhatsApp channel adapter
 * Receives text DMs via Baileys, parses messages, hands off to ChannelService
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';
import type { OnInboundMessageFn } from '../types.js';
import { InboundMediaHandler, type InboundMediaSource } from '../media-handler.js';
import { createWhatsAppSocket, type WhatsAppInboundMessage } from './session.js';
import { resolveChannelsDir } from '../../../config/paths.js';
import { Reconnector } from '../../../lib/reconnect.js';

export class WhatsAppAdapter extends InboundMediaHandler {
  readonly type = 'whatsapp' as const;

  private sock: WASocket | null = null;
  private reconnector = new Reconnector();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authDir = '';
  private lidCache = new Map<string, string>();
  // Track latest messageId per userId for reaction support
  private latestMessageId = new Map<string, string>();

  constructor(instanceId: string, allowFrom?: string[], onInboundMessage?: OnInboundMessageFn, debounceMs?: number) {
    // WA normalizes phone numbers by stripping leading +
    const normalized = allowFrom?.length
      ? allowFrom.map(p => p.replace(/^\+/, ''))
      : undefined;
    super(instanceId, 'whatsapp', normalized, onInboundMessage, debounceMs);
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
    this.authDir = path.join(resolveChannelsDir(), this.instanceId);

    const creds = path.join(this.authDir, 'creds.json');
    if (!existsSync(creds)) {
      this.status = 'error';
      throw new Error(`No auth state found at ${this.authDir} — run "vargos channels setup ${this.type}" to pair this instance`);
    }

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

  async sendMedia(recipientId: string, filePath: string, mimeType: string, caption?: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    const buffer = readFileSync(filePath);
    const jid = this.toJid(recipientId);
    const fileName = path.basename(filePath);
    const [mediaType] = mimeType.split('/');

    if (mediaType === 'image') {
      await this.sock.sendMessage(jid, { image: buffer, caption });
    } else if (mediaType === 'video') {
      await this.sock.sendMessage(jid, { video: buffer, caption });
    } else if (mediaType === 'audio') {
      await this.sock.sendMessage(jid, { audio: buffer, mimetype: mimeType });
    } else {
      await this.sock.sendMessage(jid, { document: buffer, mimetype: mimeType, fileName });
    }
    this.log.info(`sendMedia: ${recipientId} ${mimeType} ${fileName}`);
  }

  protected async sendTypingIndicator(recipientId: string): Promise<void> {
    await this.sock?.sendPresenceUpdate('composing', this.toJid(recipientId));
  }

  async react(recipientId: string, messageId: string, emoji: string): Promise<void> {
    const jid = this.toJid(recipientId);
    await this.sock?.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    });
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
      // Flush any pending text so it reaches the agent before the media message
      this.debouncer.flush(this.buildUserId(msg.jid));
      this.handleMedia(msg).catch((err) => {
        this.log.error(`handleMedia error for ${msg.jid}: ${err}`);
      });
      return;
    }

    this.log.info(`received from ${msg.jid}: ${msg.text.slice(0, 80)}`);
    const userId = this.buildUserId(msg.jid);
    this.latestMessageId.set(userId, msg.messageId);
    this.debouncer.push(userId, msg.text);
  }

  private buildUserId(jid: string): string {
    return this.resolvePhone(jid);
  }

  protected override async handleBatch(id: string, messages: string[]): Promise<void> {
    const messageId = this.latestMessageId.get(id);
    const text = messages.join('\n');
    this.log.info(`batch for ${this.instanceId}:${id}: "${text.slice(0, 80)}"`);
    await this.routeToService(id, text, messageId ? { messageId } : undefined);
  }

  protected async resolveMedia(msg: unknown): Promise<InboundMediaSource | null> {
    const m = msg as WhatsAppInboundMessage;
    if (!m.mediaBuffer) return null;

    const mimeDefaults: Record<string, string> = {
      image: 'image/jpeg', audio: 'audio/ogg', video: 'video/mp4', document: 'application/pdf',
    };
    // Strip codec params (e.g. "audio/ogg; codecs=opus" → "audio/ogg")
    const rawMime = m.mimeType?.split(';')[0].trim();
    const mimeType = rawMime || mimeDefaults[m.mediaType!] || 'application/octet-stream';
    return {
      buffer: m.mediaBuffer,
      mimeType,
      mediaType: (m.mediaType as InboundMediaSource['mediaType']) ?? 'document',
      caption: m.caption,
    };
  }

  private async handleMedia(msg: WhatsAppInboundMessage): Promise<void> {
    const userId = this.buildUserId(msg.jid);
    const sessionKey = `${this.instanceId}:${userId}`;

    if (!msg.mediaBuffer) {
      // Media without buffer — fallback text
      const typeLabels: Record<string, string> = {
        audio: 'Voice message', video: 'Video message', document: 'Document', sticker: 'Sticker',
      };
      const label = typeLabels[msg.mediaType!] || 'Media';
      await this.routeToService(userId, msg.caption ? `[${label}] ${msg.caption}` : `[${label} received]`);
      return;
    }

    await this.processInboundMedia(
      msg,
      userId,
      sessionKey,
      (text, metadata) => this.routeToService(userId, text, metadata),
    );
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
