/**
 * WhatsApp channel adapter
 * Receives text DMs via Baileys, processes through gateway, delivers replies
 */

import type { WASocket } from '@whiskeysockets/baileys';
import type { ChannelAdapter, ChannelStatus } from '../../core/channels/types.js';
import { createWhatsAppSocket, type WhatsAppInboundMessage } from './session.js';
import { createDedupeCache } from '../../core/lib/dedupe.js';
import { createMessageDebouncer } from '../../core/lib/debounce.js';
import { processAndDeliver, type InputType, type NormalizedInput, type GatewayContext } from '../../core/gateway/core.js';
import { resolveChannelsDir } from '../../core/config/paths.js';
import { Reconnector } from '../../core/channels/reconnect.js';
import { createLogger } from '../../core/lib/logger.js';
import path from 'node:path';

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

  constructor(allowFrom?: string[]) {
    this.allowFrom = allowFrom?.length ? new Set(allowFrom) : null;
    this.debouncer = createMessageDebouncer(
      (jid, messages) => {
        this.handleBatch(jid, messages).catch((err) => {
          log.debug(`handleBatch error for ${jid}: ${err}`);
        });
      },
      { delayMs: 1500 },
    );
  }

  async initialize(): Promise<void> {
    // Auth state dir created on start
  }

  async start(): Promise<void> {
    // Clean up previous socket before reconnecting
    if (this.sock) {
      try { this.sock.end(undefined); } catch { /* already closed */ }
      this.sock = null;
    }

    this.status = 'connecting';
    const authDir = path.join(resolveChannelsDir(), 'whatsapp');

    try {
      this.sock = await createWhatsAppSocket(authDir, {
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
      log.debug(`failed to start: ${err}`);
      this.scheduleReconnect();
    }
  }

  async stop(): Promise<void> {
    this.debouncer.cancelAll();
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
    await this.sock.sendMessage(jid, { text });
  }

  private handleInbound(msg: WhatsAppInboundMessage): void {
    // Skip self messages and groups
    if (msg.fromMe || msg.isGroup) return;

    // Whitelist filter
    if (this.allowFrom) {
      const phone = msg.jid.replace('@s.whatsapp.net', '');
      if (!this.allowFrom.has(phone)) return;
    }

    // Skip messages with no text and no media
    if (!msg.text && !msg.mediaType) return;

    // Deduplicate
    if (!this.dedupe.add(msg.messageId)) return;

    // Media messages bypass debouncer — send directly to gateway
    if (msg.mediaType) {
      log.debug(`received ${msg.mediaType} from ${msg.jid}`);
      this.handleMedia(msg).catch((err) => {
        log.debug(`handleMedia error for ${msg.jid}: ${err}`);
      });
      return;
    }

    log.debug(`received from ${msg.jid}: ${msg.text.slice(0, 80)}`);
    this.debouncer.push(msg.jid, msg.text);
  }

  private async handleMedia(msg: WhatsAppInboundMessage): Promise<void> {
    const jid = msg.jid;
    const sessionKey = `whatsapp:${jid.replace('@s.whatsapp.net', '')}`;

    const context: GatewayContext = {
      sessionKey,
      userId: jid,
      channel: 'whatsapp',
      permissions: ['*'],
      metadata: {},
    };

    const send = (chunk: string) => this.send(jid, chunk);

    const typeMap: Record<string, InputType> = {
      image: 'image', audio: 'voice', video: 'video', document: 'file', sticker: 'file',
    };
    const inputType: InputType = typeMap[msg.mediaType!] || 'file';

    // Media with downloaded buffer
    if (msg.mediaBuffer) {
      const input: NormalizedInput = {
        type: inputType,
        content: msg.mediaBuffer,
        metadata: {
          mimeType: msg.mimeType || (inputType === 'image' ? 'image/jpeg' : undefined),
          caption: msg.caption,
        },
        source: { channel: 'whatsapp', userId: jid, sessionKey },
        timestamp: Date.now(),
      };
      const typing = () => this.sock!.sendPresenceUpdate('composing', jid);
      await processAndDeliver(input, context, send, typing);
      return;
    }

    // No buffer (download failed) — send text description
    const descriptions: Record<string, string> = {
      audio: 'Voice message', video: 'Video message',
      document: 'Document', sticker: 'Sticker',
    };
    const label = descriptions[msg.mediaType!] || 'Media';
    const input: NormalizedInput = {
      type: 'text',
      content: msg.caption ? `[${label}] ${msg.caption}` : `[${label} received]`,
      metadata: { encoding: 'utf-8' },
      source: { channel: 'whatsapp', userId: jid, sessionKey },
      timestamp: Date.now(),
    };
    const typing = () => this.sock!.sendPresenceUpdate('composing', jid);
    await processAndDeliver(input, context, send, typing);
  }

  private async handleBatch(jid: string, messages: string[]): Promise<void> {
    const text = messages.join('\n');
    const sessionKey = `whatsapp:${jid.replace('@s.whatsapp.net', '')}`;

    log.debug(`batch for ${sessionKey}: "${text.slice(0, 80)}"`);

    const input: NormalizedInput = {
      type: 'text',
      content: text,
      metadata: { encoding: 'utf-8' },
      source: { channel: 'whatsapp', userId: jid, sessionKey },
      timestamp: Date.now(),
    };

    const context: GatewayContext = {
      sessionKey,
      userId: jid,
      channel: 'whatsapp',
      permissions: ['*'],
      metadata: {},
    };

    const typing = () => this.sock!.sendPresenceUpdate('composing', jid);
    const result = await processAndDeliver(input, context, (chunk) => this.send(jid, chunk), typing);
    if (!result.success) {
      log.debug(`gateway error for ${sessionKey}: ${result.content}`);
    }
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
