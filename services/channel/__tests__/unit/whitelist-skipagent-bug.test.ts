/**
 * Whitelisted user sends "@VargosBot are u up?" with an @mention in a group: the
 * normalizer must detect the @username mention (not only reply_to_message) so the
 * pipeline routes to agent.execute, not agent.appendMessage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmitterBus } from '../../../../core/bus.js';
import { ChannelService } from '../../index.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
import { normalizeTelegramMessage } from '../../providers/telegram/normalizer.js';
import type { AppConfig } from '../../../config/index.js';
import type { AdapterDeps } from '../../types.js';
import type { TelegramMessage } from '../../providers/telegram/types.js';

class MockTelegramAdapter extends BaseChannelAdapter {
  readonly type = 'telegram' as const;
  botUserId = 987654321;
  botUsername = 'VargosBot';

  constructor(instanceId: string, deps: AdapterDeps) {
    super(instanceId, 'telegram', deps);
  }

  async start(): Promise<void> { this.status = 'connected'; }
  async stop(): Promise<void> { this.status = 'disconnected'; }
  async send(): Promise<void> {}
  protected async sendTypingIndicator(): Promise<void> {}

  /** Normalize a raw Telegram message through the real normalizer, then route it. */
  simulateInboundMessage(sessionKey: string, telegramMsg: TelegramMessage): Promise<void> {
    if (!this.onInboundMessage) throw new Error('onInboundMessage not set');
    const normalized = normalizeTelegramMessage(telegramMsg, { botUserId: this.botUserId, botUsername: this.botUsername });
    if (!normalized) throw new Error('Failed to normalize message');
    return this.onInboundMessage(sessionKey, normalized);
  }
}

describe('Whitelist + skipAgent', () => {
  let bus: EmitterBus;
  let channelService: ChannelService;
  let adapter: MockTelegramAdapter;
  let agentExecuteCalls: Array<{ sessionKey?: string; task: string }>;
  let agentAppendMessageCalls: Array<{ sessionKey: string; content: string }>;

  const WHITELISTED_USER_ID = '100001';
  const GROUP_CHAT_ID = '-100123456789';

  const mockConfig = {
    providers: { test: { baseUrl: 'http://localhost', apiKey: 'test', api: 'test', models: [] } },
    agent: { model: 'test:test' },
    // enabled: false → init() skips starting a real Telegram adapter; the mock is injected below.
    channels: [{ id: 'telegram-vargos', type: 'telegram' as const, botToken: 'test-token', enabled: false, allowFrom: [WHITELISTED_USER_ID] }],
    webhooks: [], linkExpand: {}, mcp: {}, paths: {}, gateway: { port: 9000 },
  } as unknown as AppConfig;

  beforeEach(async () => {
    agentExecuteCalls = [];
    agentAppendMessageCalls = [];
    bus = new EmitterBus();

    vi.spyOn(bus, 'call').mockImplementation(async (event: string, params?: unknown) => {
      if (event === 'config.get') return mockConfig as unknown;
      if (event === 'agent.execute') { agentExecuteCalls.push(params as { sessionKey?: string; task: string }); return { response: 'executed' }; }
      if (event === 'agent.appendMessage') { agentAppendMessageCalls.push(params as { sessionKey: string; content: string }); return { appended: true }; }
      return {};
    });

    channelService = new ChannelService();
    await channelService.init(bus);

    adapter = new MockTelegramAdapter('telegram-vargos', {
      onInbound: channelService['onInboundMessage'].bind(channelService),
    });
    await adapter.start();
    (channelService as unknown as { adapters: Map<string, unknown> }).adapters.set('telegram-vargos', adapter);
  });

  it('whitelisted user in group with @mention executes agent, not append', async () => {
    const telegramMsg: TelegramMessage = {
      message_id: 100,
      from: { id: parseInt(WHITELISTED_USER_ID), is_bot: false, first_name: 'TestUser' },
      chat: { id: parseInt(GROUP_CHAT_ID), type: 'group' },
      date: Math.floor(Date.now() / 1000),
      text: '@VargosBot are u up?',
    };

    await adapter.simulateInboundMessage(`telegram-vargos:${GROUP_CHAT_ID}`, telegramMsg);

    expect(agentExecuteCalls).toHaveLength(1);
    expect(agentAppendMessageCalls).toHaveLength(0);
    expect(agentExecuteCalls[0].task).toBe('@VargosBot are u up?');
  });
});
