/**
 * Channel service — manages external messaging adapters
 *
 * Methods: channel.send, channel.status, channel.list
 * Events:  message.received, channel.connected, channel.disconnected
 *
 * Owns adapter instances. When an adapter receives a message, the service
 * emits a message.received event. The agent service subscribes and handles it.
 */

import { ServiceClient } from '../../gateway/service-client.js';
import type { ChannelAdapter, ChannelType, ChannelConfig } from '../../contracts/channel.js';
import { deliverReply } from '../../lib/reply-delivery.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('channels');

export interface ChannelServiceConfig {
  gatewayUrl?: string;
}

export class ChannelService extends ServiceClient {
  private adapters = new Map<string, ChannelAdapter>();

  constructor(config: ChannelServiceConfig = {}) {
    super({
      service: 'channel',
      methods: ['channel.send', 'channel.status', 'channel.list'],
      events: ['message.received', 'channel.connected', 'channel.disconnected'],
      subscriptions: [],
      gatewayUrl: config.gatewayUrl,
    });
  }

  /**
   * Register and start an adapter. The service wires it into the event pipeline.
   */
  async addAdapter(adapter: ChannelAdapter): Promise<void> {
    this.adapters.set(adapter.type, adapter);
  }

  getAdapter(type: string): ChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  listAdapters(): Array<{ type: string; status: string }> {
    return Array.from(this.adapters.entries()).map(([type, a]) => ({
      type,
      status: a.status,
    }));
  }

  /**
   * Called by adapter integration code when an inbound message arrives.
   * Emits message.received for the agent service to pick up.
   */
  async onInboundMessage(channel: string, userId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    const sessionKey = `${channel}:${userId}`;

    // Create session if needed
    await this.call('sessions', 'session.create', {
      sessionKey,
      kind: 'main',
      metadata: { channel },
    }).catch((err: unknown) => {
      // Suppress "already exists" — session.create throws when the key is taken
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) throw err;
    });

    // Store user message
    await this.call('sessions', 'session.addMessage', {
      sessionKey,
      content,
      role: 'user',
      metadata: { type: 'task', channel, ...metadata },
    });

    log.info(`inbound: ${channel}:${userId} "${content.slice(0, 80)}"`);
    this.emit('message.received', { channel, userId, sessionKey, content, metadata });
  }

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    const p = params as Record<string, unknown>;

    switch (method) {
      case 'channel.send': {
        const { channel, userId, text } = p as { channel: string; userId: string; text: string };
        const adapter = this.adapters.get(channel);
        if (!adapter) throw new Error(`No adapter for channel: ${channel}`);
        log.info(`send: ${channel}:${userId} (${text.length} chars)`);
        try {
          await deliverReply((chunk) => adapter.send(userId, chunk), text);
        } catch (err) {
          log.error(`send failed: ${channel}:${userId}: ${err}`);
          throw err;
        }
        return { sent: true };
      }

      case 'channel.status': {
        const type = p.channel as string | undefined;
        if (type) {
          const adapter = this.adapters.get(type);
          if (!adapter) throw new Error(`No adapter for channel: ${type}`);
          return { type, status: adapter.status };
        }
        return this.listAdapters();
      }

      case 'channel.list':
        return this.listAdapters();

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  handleEvent(): void {
    // Channel service subscribes to nothing
  }

  async stopAdapters(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try { await adapter.stop(); } catch { /* best effort */ }
    }
  }
}
