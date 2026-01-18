/**
 * WhatsApp channel adapter
 * Receives text DMs via Baileys, processes through gateway, delivers replies
 */

import type { WASocket } from '@whiskeysockets/baileys';
import type { ChannelAdapter, ChannelStatus } from '../types.js';
import { createWhatsAppSocket, type WhatsAppInboundMessage } from './session.js';
import { createDedupeCache } from '../../lib/dedupe.js';
import { createMessageDebouncer } from '../../lib/debounce.js';
import { deliverReply } from '../../lib/reply-delivery.js';
import { getGateway, type NormalizedInput, type GatewayContext } from '../../gateway/core.js';
import { resolveChannelsDir } from '../../config/paths.js';
import path from 'node:path';

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 60_000;

export class WhatsAppAdapter implements ChannelAdapter {
  readonly type = 'whatsapp' as const;
  status: ChannelStatus = 'disconnected';

  private sock: WASocket | null = null;
  private dedupe = createDedupeCache({ ttlMs: 120_000 });
  private debouncer: ReturnType<typeof createMessageDebouncer>;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.debouncer = createMessageDebouncer(
      (jid, messages) => {
        this.handleBatch(jid, messages).catch((err) => {
          console.error(`[WhatsApp] handleBatch error for ${jid}:`, err);
        });
      },
      { delayMs: 1500 },
    );
  }

  async initialize(): Promise<void> {
    // Auth state dir created on start
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    const authDir = path.join(resolveChannelsDir(), 'whatsapp');

    try {
      this.sock = await createWhatsAppSocket(authDir, {
        onQR: () => {
          console.error('[WhatsApp] Scan the QR code above with WhatsApp > Linked Devices');
        },
        onConnected: (name) => {
          console.error(`[WhatsApp] Connected as ${name}`);
          this.status = 'connected';
          this.reconnectAttempt = 0;
        },
        onDisconnected: (reason) => {
          console.error(`[WhatsApp] Disconnected: ${reason}`);
          this.status = 'disconnected';
          if (reason === 'logged_out') return;
          // restart_required (515) — reconnect immediately, no backoff
          if (reason === 'restart_required') {
            this.reconnectAttempt = 0;
          }
          this.scheduleReconnect();
        },
        onMessage: (msg) => this.handleInbound(msg),
      });
    } catch (err) {
      this.status = 'error';
      console.error('[WhatsApp] Failed to start:', err);
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
    // Skip self messages, groups, and empty text
    if (msg.fromMe || msg.isGroup || !msg.text) return;

    // Deduplicate
    if (!this.dedupe.add(msg.messageId)) return;

    console.error(`[WhatsApp] Received from ${msg.jid}: ${msg.text.slice(0, 80)}`);

    // Debounce per sender
    this.debouncer.push(msg.jid, msg.text);
  }

  private async handleBatch(jid: string, messages: string[]): Promise<void> {
    const text = messages.join('\n');
    const sessionKey = `whatsapp:${jid.replace('@s.whatsapp.net', '')}`;

    console.error(`[WhatsApp] Processing batch for ${sessionKey}: "${text.slice(0, 80)}"`);

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

    const gateway = getGateway();
    const result = await gateway.processInput(input, context);

    if (!result.success) {
      console.error(`[WhatsApp] Gateway error for ${sessionKey}:`, result.content);
      return;
    }

    if (result.content) {
      const replyText = typeof result.content === 'string'
        ? result.content
        : result.content.toString('utf-8');

      console.error(`[WhatsApp] Sending reply to ${jid}: "${replyText.slice(0, 80)}..."`);
      await deliverReply(
        (chunk) => this.send(jid, chunk),
        replyText,
      );
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;
    console.error(`[WhatsApp] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.start();
    }, delay);
  }
}
