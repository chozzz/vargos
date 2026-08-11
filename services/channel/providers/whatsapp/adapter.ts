/**
 * WhatsApp channel adapter via Baileys
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { jidNormalizedUser, downloadMediaMessage } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import type { InboundMediaSource, NormalizedInboundMessage, AdapterDeps } from '../../types.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
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
  private reconnector = new Reconnector();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authDir = '';
  /** Set when creds are invalid/logged-out. Stops reconnect attempts — repair is CLI-only. */
  private needsRepair = false;

  constructor(instanceId: string, deps: AdapterDeps) {
    super(instanceId, deps);
  }

  async start(): Promise<void> {
    this.needsRepair = false; // explicit start() always clears a previous repair flag
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
        `No auth state found at ${this.authDir} — run "vargos channel pair ${this.instanceId}" to pair`,
      );
    }

    try {
      this.sock = await createWhatsAppSocket(this.authDir, {
        onQR: () => {
          // The daemon never pairs interactively. A QR means the creds are missing/invalid.
          // We close the socket immediately — the auth dir is then free to use with the CLI.
          try { this.sock?.end(undefined); } catch { /* already closing */ }
          this.sock = null;
          this.requireRepair('Credentials are invalid or expired.');
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

          if (reason === 'logged_out') return this.requireRepair('Another device removed this session.');
          if (reason === 'forbidden') return this.requireRepair('Account may be banned or credentials revoked.');

          this.status = 'disconnected';
          this.scheduleReconnect();
        },
        onMessage: (msg) => void this.receive(msg),
      });
    } catch (err) {
      this.status = 'error';
      this.log.error('failed to start', { error: toMessage(err) });
      this.scheduleReconnect();
    }
  }

  async stop(): Promise<void> {
    this.cleanup();
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

  protected normalize(msg: WhatsAppInboundMessage): NormalizedInboundMessage | null {
    return normalizeWhatsAppMessage(msg, { botJid: this.botJid });
  }

  protected async sendText(chatId: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    const jid = this.toJid(chatId);
    await this.sock.sendMessage(jid, { text });
    this.log.debug(`sent to ${jid} (${text.length} chars)`);
  }

  protected async sendTyping(chatId: string): Promise<void> {
    await this.sock?.sendPresenceUpdate('composing', this.toJid(chatId));
  }

  async react(sessionKey: string, messageId: string, emoji: string): Promise<void> {
    const jid = this.toJid(this.chatId(sessionKey));
    await this.sock?.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: messageId } },
    });
  }

  async sendMedia(sessionKey: string, filePath: string, mimeType: string, caption?: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    const jid = this.toJid(this.chatId(sessionKey));
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

  protected async resolveMedia(msg: WhatsAppInboundMessage): Promise<InboundMediaSource | null> {
    if (!msg.raw || !msg.mediaType) return null;

    try {
      const downloaded = await downloadMediaMessage(msg.raw, 'buffer', {});
      const buffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded as Uint8Array);
      if (buffer.length === 0) {
        this.log.warn(`empty media buffer for ${msg.messageId} (${msg.mediaType})`);
        return null;
      }
      return {
        buffer,
        mimeType: msg.mimeType?.split(';')[0].trim()
          || MEDIA_TYPE_MIME_DEFAULTS[msg.mediaType]
          || 'application/octet-stream',
        caption: msg.caption,
      };
    } catch (err) {
      this.log.error(`media download failed for ${msg.messageId} (${msg.mediaType}): ${toMessage(err)}`);
      return null;
    }
  }

  private toJid(id: string): string {
    // Anything with an @ is already addressable: jidNormalizedUser canonicalises the
    // domain (c.us → s.whatsapp.net) and leaves @lid and @g.us intact.
    if (id.includes('@')) return jidNormalizedUser(id);
    // Plain phone number — append the canonical domain
    return `${id.replace(/^\+/, '')}@s.whatsapp.net`;
  }

  /** Terminal auth failure: stop reconnecting and tell the operator how to fix it. */
  private requireRepair(cause: string): void {
    this.needsRepair = true;
    this.status = 'error';
    this.log.error([
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `  WhatsApp "${this.instanceId}" needs re-pairing`,
      `  ${cause}`,
      '  This channel will not send or receive messages.',
      '  Daemon does NOT need to stop. Run:',
      `    1. vargos channel pair ${this.instanceId} --reset`,
      `    2. vargos channel restart ${this.instanceId}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n'));
  }

  private scheduleReconnect(): void {
    if (this.needsRepair || this.reconnectTimer) return; // repair is CLI-only — never loop
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
