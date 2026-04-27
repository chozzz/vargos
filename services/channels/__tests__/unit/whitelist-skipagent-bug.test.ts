/**
 * Test for whitelist + skipAgent bug
 *
 * Bug: Whitelisted user sends a message in group chat with bot mention (@VargosBot),
 * but message is appended (no execution) instead of triggering agent.execute.
 *
 * Root cause: normalizeTelegramMessage.isMentionedInMessage() only checks for
 * reply_to_message, not for @username mentions in text. So "@VargosBot are u up?"
 * is not detected as a mention, causing skipAgent to be set to true.
 *
 * This test reproduces the issue from the logs:
 * - User 100001 (whitelisted) sends "@VargosBot are u up?" in group
 * - normalizer doesn't detect @mention because isMentionedInMessage is incomplete
 * - Message gets skipAgent=true, causing appendMessage instead of execute
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { ChannelService } from '../../index.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
import { normalizeTelegramMessage } from '../../providers/telegram/normalizer.js';
import type { AppConfig } from '../../../config/index.js';
import type { AdapterDeps } from '../../contracts.js';
import type { TelegramMessage } from '../../providers/telegram/types.js';
import type { EventMap } from '../../../../gateway/event-map.js';

class MockTelegramAdapter extends BaseChannelAdapter {
  readonly type = 'telegram' as const;
  botUserId = 987654321;

  constructor(instanceId: string, deps: AdapterDeps) {
    super(instanceId, 'telegram', deps);
  }

  async start(): Promise<void> {
    this.status = 'connected';
  }

  async stop(): Promise<void> {
    this.status = 'disconnected';
  }

  async send(): Promise<void> {
    // no-op
  }

  protected async sendTypingIndicator(): Promise<void> {
    // no-op
  }

  /**
   * Simulate receiving a raw Telegram message and normalize it
   * (this goes through the real normalizer to show the bug)
   */
  simulateInboundMessage(sessionKey: string, telegramMsg: TelegramMessage): Promise<void> {
    if (!this.onInboundMessage) throw new Error('onInboundMessage not set');

    // Normalize like the real adapter does
    const normalizedMsg = normalizeTelegramMessage(telegramMsg, { botUserId: this.botUserId });
    if (!normalizedMsg) throw new Error('Failed to normalize message');

    return this.onInboundMessage(sessionKey, normalizedMsg);
  }
}

describe('Whitelist + skipAgent Bug', () => {
  let bus: EventEmitterBus;
  let channelService: ChannelService;
  let adapter: MockTelegramAdapter;

  let agentExecuteCalls: EventMap['agent.execute']['params'][] = [];
  let agentAppendMessageCalls: EventMap['agent.appendMessage']['params'][] = [];

  const WHITELISTED_USER_ID = '100001';
  const GROUP_CHAT_ID = '-100123456789';

  const mockConfig: AppConfig = {
    providers: { test: { baseUrl: 'http://localhost', apiKey: 'test', api: 'test', models: [] } },
    agent: { model: 'test:test', executionTimeoutMs: 30000 },
    channels: [
      {
        id: 'telegram-vargos',
        type: 'telegram' as const,
        botToken: 'test-token',
        allowFrom: [WHITELISTED_USER_ID],
      },
    ],
    cron: { tasks: [] },
    webhooks: [],
    heartbeat: {},
    linkExpand: {},
    mcp: {},
    paths: {},
    gateway: { port: 9000 },
  };

  beforeEach(async () => {
    agentExecuteCalls = [];
    agentAppendMessageCalls = [];

    bus = new EventEmitterBus();

    // Capture both execute and appendMessage calls
    const originalCall = bus.call.bind(bus);
    vi.spyOn(bus, 'call').mockImplementation(async (eventName, params) => {
      if (eventName === 'agent.execute') {
        agentExecuteCalls.push(params as EventMap['agent.execute']['params']);
        return { response: 'executed' };
      }
      if (eventName === 'agent.appendMessage') {
        agentAppendMessageCalls.push(params as EventMap['agent.appendMessage']['params']);
        return { appended: true };
      }
      return originalCall(eventName, params);
    });

    channelService = new ChannelService(bus, mockConfig);
    await channelService.start();
    bus.bootstrap(channelService);

    adapter = new MockTelegramAdapter('telegram-vargos', {
      onInbound: channelService['onInboundMessage'].bind(channelService),
    });

    await adapter.start();
    (channelService as Record<string, unknown>).adapters.set('telegram-vargos', adapter);
  });

  it('whitelisted user in group with @mention SHOULD execute agent, not append', async () => {
    // This is the exact scenario from the logs:
    // User 100001 sends "@VargosBot are u up?" in group chat -100123456789
    //
    // The normalizer receives the raw TelegramMessage and must detect the @mention
    // and set isMentioned=true. If not detected, skipAgent will be set to true
    // and agent.appendMessage is called instead of agent.execute.
    //
    // Current bug: normalizer.isMentionedInMessage only checks reply_to_message,
    // not @username mentions in the text.
    const telegramMsg: TelegramMessage = {
      message_id: 100,
      from: {
        id: parseInt(WHITELISTED_USER_ID),
        is_bot: false,
        first_name: 'TestUser',
      },
      chat: {
        id: parseInt(GROUP_CHAT_ID),
        type: 'group',
      },
      date: Math.floor(Date.now() / 1000),
      text: '@VargosBot are u up?', // Bot is mentioned with @ in the text
      // Note: reply_to_message is undefined, so the bug will be exposed
      // The normalizer should still detect this as a mention
    };

    const sessionKey = `telegram-vargos:${GROUP_CHAT_ID}`;
    await adapter.simulateInboundMessage(sessionKey, telegramMsg);

    // EXPECTED: Should call agent.execute, not agent.appendMessage
    // ACTUAL BUG: Calls agent.appendMessage because isMentionedInMessage
    //             only checks reply_to_message, not @username in text
    expect(agentExecuteCalls).toHaveLength(1, 'agent.execute should be called for whitelisted user with @mention');
    expect(agentAppendMessageCalls).toHaveLength(0, 'agent.appendMessage should NOT be called');
    expect(agentExecuteCalls[0].task).toBe('@VargosBot are u up?');
  });
});
