/**
 * WhatsApp channel adapter via Baileys
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { jidDecode, jidNormalizedUser, areJidsSameUser } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import type { InboundMediaSource, NormalizedInboundMessage, AdapterDeps } from '../../types.js';
import { BaseChannelAdapter, MEDIA_TYPE_LABELS } from '../../base-adapter.js';
import { createWhatsAppSocket } from './session.js';
import type { WhatsAppInboundMessage } from './types.js';
import { normalizeWhatsAppMessage } from './normalizer.js';
import { getDataPaths } from '../../../../lib/paths.js';
import { toMessage } from '../../../../lib/error.js';
import { Reconnector } from '../../reconnect.js';
import { MEDIA_TYPE_MIME_DEFAULTS } from '../../../../lib/mime.js';

export class WhatsAppAdapter extends BaseChannelAdapter<WhatsAppInboundMessage> {
  readonly type = 'whatsapp' as const;

  private sock: WASocket | null = null;
  private botJid = '';
  private botLid: string | null = null; // learned from proper mentions
  private reconnector = new Reconnector();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authDir = '';

  constructor(
    instanceId: string,
    deps: AdapterDeps,
    allowFrom?: string[],
  ) {
    super(instanceId, 'whatsapp', deps, allowFrom);
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
          this.botJid = this.sock?.user?.id || '';
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
              this.log.error('failed to reset credentials', { error: toMessage(err) });
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
      this.log.error('failed to start', { error: toMessage(err) });
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
    const targetJid = this.toJid(this.extractUserId(sessionKey));
    this.log.info(`send: sessionKey=${sessionKey} targetJid=${targetJid} text=${text.slice(0, 80)}`);
    await this.sock.sendMessage(targetJid, { text });
    this.log.info(`send: delivered to ${targetJid}`);
  }

  async sendMedia(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    const jid = this.toJid(this.extractUserId(sessionKey));
    const buffer = readFileSync(filePath);
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
    await this.sock?.sendPresenceUpdate('composing', this.toJid(this.extractUserId(sessionKey)));
  }

  async react(sessionKey: string, messageId: string, emoji: string): Promise<void> {
    const jid = this.toJid(this.extractUserId(sessionKey));
    this.log.info(`react: sessionKey=${sessionKey} jid=${jid} messageId=${messageId} emoji=${emoji}`);
    await this.sock?.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    });
  }

  private toJid(id: string): string {
    // If already a full JID with domain, normalize and return
    if (id.includes('@')) {
      const decoded = jidDecode(id);
      if (decoded) return jidNormalizedUser(id);
    }
    // Plain phone number — append canonical domain
    return `${id.replace(/^\+/, '')}@s.whatsapp.net`;
  }

  private handleInbound(msg: WhatsAppInboundMessage): void {
    if (msg.fromMe) return;

    if (!this.dedupe.add(msg.messageId)) return;

    // Learn bot's LID from proper mentions (mentionedJids populated by WhatsApp).
    // When user mentions bot via the menu, WhatsApp includes the bot's LID in mentionedJids.
    // We cache it so text fallback (@number typing) can match it later.
    if (msg.mentionedJids) {
      for (const jid of msg.mentionedJids) {
        if (areJidsSameUser(jid, this.botJid) && jid !== this.botJid) {
          this.botLid = jid;
          this.log.debug(`learned bot LID: ${jid} (from ${this.botJid})`);
          break;
        }
      }
    }

    const chatId = msg.sessionJid; // group JID for groups, user JID for private
    const normalizedMsg = normalizeWhatsAppMessage(msg, {
      botJid: this.botJid,
      botLid: this.botLid,
      botName: this.sock?.user?.name,
    });

    if (!normalizedMsg) {
      this.log.error(`whatsapp message from user ${msg.jid} not normalized`);
      return;
    }

    if (msg.mediaType) {
      this.log.debug(`received ${msg.mediaType} from ${normalizedMsg.fromUserId}`);
      this.debouncer.flush(chatId);
      this.handleMedia(msg, normalizedMsg).catch((err) => {
        this.log.error('handleMedia error', { jid: normalizedMsg.fromUserId, error: toMessage(err) });
      });
      return;
    }

    this.log.debug(`received from ${normalizedMsg.fromUserId}: ${msg.text?.slice(0, 80) || ''}`);
    this.latestMessageId.set(chatId, msg.messageId);
    this.debouncer.push(chatId, msg.text, normalizedMsg);
  }

  protected async resolveMedia(msg: WhatsAppInboundMessage): Promise<InboundMediaSource | null> {
    if (!msg.mediaBuffer) return null;

    const rawMime = msg.mimeType?.split(';')[0].trim();
    const mimeType = rawMime || MEDIA_TYPE_MIME_DEFAULTS[msg.mediaType!] || 'application/octet-stream';
    return {
      buffer: msg.mediaBuffer,
      mimeType,
      mediaType: msg.mediaType === 'sticker' ? 'image' : (msg.mediaType ?? 'document'),
      caption: msg.caption,
    };
  }

  private async handleMedia(msg: WhatsAppInboundMessage, normalizedMsg: NormalizedInboundMessage): Promise<void> {
    if (!this.onInboundMessage) {
      this.log.error('No inbound message handler');
      return;
    }

    const userId = msg.jid;
    const sessionKey = this.buildSessionKey(userId);

    if (!msg.mediaBuffer) {
      const label = MEDIA_TYPE_LABELS[msg.mediaType!] || 'Media';
      const content = msg.caption ? `[${label}] ${msg.caption}` : `[${label} received]`;

      const messageWithText: NormalizedInboundMessage = { ...normalizedMsg, text: content };
      await this.onInboundMessage(sessionKey, messageWithText);
      return;
    }

    const { caption, savedPath, mimeType } = await this.processInboundMedia(
      msg,
      (text) => this.onInboundMessage!(sessionKey, { ...normalizedMsg, text }),
      sessionKey,
      normalizedMsg.chatType !== 'group',
    );
    this.log.debug(`received ${msg.mediaType} from ${userId}: ${caption} (${mimeType}) - ${savedPath}`);
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
