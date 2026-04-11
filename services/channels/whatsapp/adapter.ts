/**
 * WhatsApp channel adapter via Baileys
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';
import type { OnInboundMessageFn } from '../types.js';
import { InboundMediaHandler, type InboundMediaSource } from '../media-handler.js';
import { createWhatsAppSocket, type WhatsAppInboundMessage } from './session.js';
import { getDataPaths } from '../../../lib/paths.js';
import { Reconnector } from '../../../lib/reconnect.js';

export class WhatsAppAdapter extends InboundMediaHandler {
  readonly type = 'whatsapp' as const;

  private sock: WASocket | null = null;
  private reconnector = new Reconnector();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authDir = '';
  private lidCache = new Map<string, string>();
  private latestMessageId = new Map<string, string>();

  constructor(
    instanceId: string,
    allowFrom?: string[],
    onInboundMessage?: OnInboundMessageFn,
    debounceMs?: number,
  ) {
    // WA strips leading '+' from phone numbers
    const normalized = allowFrom?.length
      ? allowFrom.map(p => p.replace(/^\+/, ''))
      : undefined;
    super(instanceId, 'whatsapp', normalized, onInboundMessage, debounceMs);
  }

  async start(): Promise<void> {
    if (this.sock) {
      try { this.sock.end(undefined); } catch { /* already closed */ }
      this.sock = null;
    }

    this.status = 'connecting';
    this.authDir = path.join(getDataPaths().channelsDir, this.instanceId);

    const creds = path.join(this.authDir, 'creds.json');
    if (!existsSync(creds)) {
      this.status = 'error';
      throw new Error(
        `No auth state found at ${this.authDir} — run "vargos channels register whatsapp ${this.instanceId}" to pair`,
      );
    }

    try {
      this.sock = await createWhatsAppSocket(this.authDir, {
        onQR: () => {
          this.log.info('scan the QR code above with WhatsApp > Linked Devices');
        },
        onConnected: (name) => {
          this.log.debug(`connected as ${name}`);
          this.status = 'connected';
          this.reconnector.reset();
        },
        onDisconnected: (reason) => {
          this.log.info(`disconnected: ${reason}`);
          this.sock = null;

          if (reason === 'logged_out') {
            // Device was logged out - clear registered flag to force re-pairing
            this.log.info('WhatsApp device logged out — attempting to reset for re-pairing');
            try {
              this.resetCredentialsForRepairing();
            } catch (err) {
              this.log.error(`failed to reset credentials: ${err}`);
              this.status = 'error';
              return;
            }
            this.status = 'disconnected';
            this.scheduleReconnect();
            return;
          }

          if (reason === 'forbidden') {
            this.status = 'error';
            this.log.info('WhatsApp access forbidden — device may be blocked or credentials invalid');
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

  async send(sessionKey: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    const userId = this.extractUserId(sessionKey);
    this.log.info(`send: ${sessionKey} (${text.length} chars)`);
    await this.sock.sendMessage(this.toJid(userId), { text });
  }

  async sendMedia(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    const userId = this.extractUserId(sessionKey);
    const buffer = readFileSync(filePath);
    const jid = this.toJid(userId);
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
    this.log.info(`sendMedia: ${sessionKey} ${mimeType} ${fileName}`);
  }

  protected async sendTypingIndicator(sessionKey: string): Promise<void> {
    const userId = this.extractUserId(sessionKey);
    await this.sock?.sendPresenceUpdate('composing', this.toJid(userId));
  }

  async react(sessionKey: string, messageId: string, emoji: string): Promise<void> {
    const userId = this.extractUserId(sessionKey);
    const jid = this.toJid(userId);
    await this.sock?.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    });
  }

  private toJid(id: string): string {
    if (id.includes('@')) return id;
    return `${id.replace(/^\+/, '')}@s.whatsapp.net`;
  }

  private resolvePhone(jid: string): string {
    if (jid.endsWith('@s.whatsapp.net')) return jid.replace('@s.whatsapp.net', '');
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
      (text, metadata) => this.routeToService(userId, text, { ...metadata, messageId: msg.messageId }),
    );
  }

  /**
   * Reset credentials to allow re-pairing after logout.
   * Sets registered=false and clears user identity so Baileys shows QR code.
   */
  private resetCredentialsForRepairing(): void {
    const credsPath = path.join(this.authDir, 'creds.json');
    const creds = JSON.parse(readFileSync(credsPath, 'utf-8')) as Record<string, unknown>;

    // Force Baileys to show QR code by marking as not registered
    creds.registered = false;
    // Clear user identity so it's treated as a new pairing
    creds.me = undefined;

    writeFileSync(credsPath, JSON.stringify(creds, null, 2));
    this.log.debug('cleared registered flag and user identity for re-pairing');
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
