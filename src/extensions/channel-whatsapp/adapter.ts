/**
 * WhatsApp channel adapter
 * Receives text DMs via Baileys, processes through gateway RPC, delivers replies
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';
import type { ChannelAdapter, ChannelStatus, GatewayCallFn } from '../../contracts/channel.js';
import { createWhatsAppSocket, type WhatsAppInboundMessage } from './session.js';
import { createDedupeCache } from '../../lib/dedupe.js';
import { createMessageDebouncer } from '../../lib/debounce.js';
import { saveMedia } from '../../lib/media.js';
import { deliverReply } from '../../lib/reply-delivery.js';
import { resolveChannelsDir } from '../../config/paths.js';
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
  private gatewayCall?: GatewayCallFn;

  constructor(allowFrom?: string[], gatewayCall?: GatewayCallFn) {
    this.allowFrom = allowFrom?.length
      ? new Set(allowFrom.flatMap(p => [p, p.replace(/^\+/, '')]))
      : null;
    this.gatewayCall = gatewayCall;
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

  private buildSessionKey(jid: string): string {
    return `whatsapp:${this.resolvePhone(jid)}`;
  }

  private async runViaGateway(params: {
    sessionKey: string;
    jid: string;
    content: string;
    channel: string;
    images?: Array<{ data: string; mimeType: string }>;
  }): Promise<void> {
    if (!this.gatewayCall) {
      log.error('No gateway connection — cannot process message');
      return;
    }

    // Create session (idempotent)
    await this.gatewayCall('sessions', 'session.create', {
      sessionKey: params.sessionKey,
      kind: 'main',
      metadata: { channel: params.channel },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) throw err;
    });

    // Store user message
    await this.gatewayCall('sessions', 'session.addMessage', {
      sessionKey: params.sessionKey,
      content: params.content,
      role: 'user',
      metadata: { type: 'task', channel: params.channel },
    });

    // Typing indicator
    let typingInterval: ReturnType<typeof setInterval> | undefined;
    if (this.sock) {
      const typing = () => this.sock!.sendPresenceUpdate('composing', params.jid);
      typing().catch(() => {});
      typingInterval = setInterval(() => typing().catch(() => {}), 4000);
    }

    try {
      const result = await this.gatewayCall<{ success: boolean; response?: string; error?: string }>(
        'agent', 'agent.run', {
          sessionKey: params.sessionKey,
          task: params.content,
          channel: params.channel,
          images: params.images,
        },
      );

      if (result.success && result.response) {
        await deliverReply((chunk) => this.send(params.jid, chunk), result.response);
      } else if (!result.success) {
        await this.send(params.jid, `[error] ${result.error || 'Agent run failed'}`).catch(() => {});
      }
    } finally {
      if (typingInterval) clearInterval(typingInterval);
    }
  }

  private async handleMedia(msg: WhatsAppInboundMessage): Promise<void> {
    const jid = msg.jid;
    const sessionKey = this.buildSessionKey(jid);

    const typeLabels: Record<string, string> = {
      audio: 'Voice message', video: 'Video message',
      document: 'Document', sticker: 'Sticker',
    };

    if (msg.mediaBuffer) {
      const isImage = msg.mediaType === 'image';
      const mimeType = msg.mimeType || (isImage ? 'image/jpeg' : 'application/octet-stream');
      const savedPath = await saveMedia({ buffer: msg.mediaBuffer, sessionKey, mimeType });

      if (isImage) {
        const caption = msg.caption || 'User sent an image.';
        const images = [{ data: msg.mediaBuffer.toString('base64'), mimeType }];
        await this.runViaGateway({
          sessionKey, jid,
          content: `${caption}\n\n[Image saved: ${savedPath}]`,
          channel: 'whatsapp', images,
        });
      } else {
        const label = typeLabels[msg.mediaType!] || 'Media';
        await this.runViaGateway({
          sessionKey, jid,
          content: `${msg.caption || `${label} received`}\n\n[${label} saved: ${savedPath}]`,
          channel: 'whatsapp',
        });
      }
      return;
    }

    // Media without buffer — fallback text
    const label = typeLabels[msg.mediaType!] || 'Media';
    await this.runViaGateway({
      sessionKey, jid,
      content: msg.caption ? `[${label}] ${msg.caption}` : `[${label} received]`,
      channel: 'whatsapp',
    });
  }

  private async handleBatch(jid: string, messages: string[]): Promise<void> {
    const text = messages.join('\n');
    const sessionKey = this.buildSessionKey(jid);
    log.info(`batch for ${sessionKey}: "${text.slice(0, 80)}"`);
    await this.runViaGateway({ sessionKey, jid, content: text, channel: 'whatsapp' });
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
