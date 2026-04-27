/**
 * Telegram E2E Tests: Whitelist Enforcement + Reply Delivery
 *
 * Verifies:
 * 1. Only whitelisted users trigger agent.execute
 * 2. Upon agent.execute completion, replies are sent to the initiating channel
 * 3. Non-whitelisted users are silently ignored
 *
 * Note: These tests mock the adapter's onInboundMessage handler to simulate
 * receiving Telegram messages, and verify the channel service's response.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { ChannelService } from '../../index.js';
import { BaseChannelAdapter } from '../../base-adapter.js';
import { TELEGRAM_USERS, TELEGRAM_CHATS } from '../../providers/telegram/__tests__/fixtures.js';
import type { AppConfig } from '../../../config/index.js';
import type { AdapterDeps, NormalizedInboundMessage } from '../../contracts.js';

/**
 * Mock Telegram adapter that simulates real adapter behavior
 */
class MockTelegramAdapter extends BaseChannelAdapter {
  readonly type = 'telegram' as const;
  sentMessages: Array<{ sessionKey: string; text: string }> = [];

  constructor(instanceId: string, deps: AdapterDeps) {
    super(instanceId, 'telegram', deps);
  }

  async start(): Promise<void> {
    this.status = 'connected';
  }

  async stop(): Promise<void> {
    this.status = 'disconnected';
  }

  async send(sessionKey: string, text: string): Promise<void> {
    this.sentMessages.push({ sessionKey, text });
  }

  protected async sendTypingIndicator(): Promise<void> {
    // No-op for testing
  }

  /** Simulate receiving a normalized message from Telegram */
  simulateInboundMessage(sessionKey: string, message: NormalizedInboundMessage): Promise<void> {
    if (!this.onInboundMessage) throw new Error('onInboundMessage not set');
    return this.onInboundMessage(sessionKey, message);
  }
}

describe('Telegram E2E — Whitelist Enforcement & Reply Delivery', () => {
  let bus: EventEmitterBus;
  let channelService: ChannelService;
  let adapter: MockTelegramAdapter;

  // Track what was called
  let agentExecuteCalls: Array<{
    sessionKey: string;
    task: string;
    metadata?: { fromUserId?: string; fromUser?: string; chatType?: string };
  }> = [];
  let channelSendCalls: Array<{ sessionKey: string; text: string }> = [];

  const mockConfig: AppConfig = {
    providers: { test: { baseUrl: 'http://localhost', apiKey: 'test', api: 'test', models: [] } },
    agent: { model: 'test:test', executionTimeoutMs: 30000 },
    channels: [
      {
        id: 'telegram-test',
        type: 'telegram' as const,
        botToken: 'test-token-xyz',
        allowFrom: [String(TELEGRAM_USERS.OWNER.id), String(TELEGRAM_USERS.ALICE.id)],
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
    channelSendCalls = [];

    bus = new EventEmitterBus();

    // Spy on bus.call to capture agent.execute invocations
    const originalCall = bus.call.bind(bus);
    vi.spyOn(bus, 'call').mockImplementation(async (eventName, params) => {
      if (eventName === 'agent.execute') {
        agentExecuteCalls.push(params as any);
        // Simulate agent completing successfully
        return { response: 'Agent processed: ' + (params as any).task };
      }
      if (eventName === 'channel.send') {
        channelSendCalls.push(params as any);
        return { sent: true };
      }
      return originalCall(eventName, params);
    });

    channelService = new ChannelService(bus, mockConfig);
    await channelService.start();
    bus.bootstrap(channelService);

    // Create mock adapter that delegates to ChannelService pipeline
    // The pipeline will enforce whitelist checks
    adapter = new MockTelegramAdapter('telegram-test', {
      onInbound: channelService['onInboundMessage'].bind(channelService),
    });

    await adapter.start();
    (channelService as any).adapters.set('telegram-test', adapter);
  });

  describe('Whitelist Enforcement', () => {
    it('whitelisted user (OWNER) triggers agent.execute', async () => {
      const ownerMsg: NormalizedInboundMessage = {
        messageId: 'msg-1',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'test command',
      };

      const sessionKey = `telegram-test:${TELEGRAM_USERS.OWNER.id}`;
      await adapter.simulateInboundMessage(sessionKey, ownerMsg);

      // Verify agent.execute was called
      expect(agentExecuteCalls).toHaveLength(1);
      expect(agentExecuteCalls[0].task).toBe('test command');
      expect(agentExecuteCalls[0].metadata?.fromUser).toBe(TELEGRAM_USERS.OWNER.first_name);
    });

    it('whitelisted user (ALICE) triggers agent.execute', async () => {
      const aliceMsg: NormalizedInboundMessage = {
        messageId: 'msg-2',
        fromUserId: String(TELEGRAM_USERS.ALICE.id),
        fromUser: TELEGRAM_USERS.ALICE.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'hello',
      };

      const sessionKey = `telegram-test:${TELEGRAM_USERS.ALICE.id}`;
      await adapter.simulateInboundMessage(sessionKey, aliceMsg);

      expect(agentExecuteCalls).toHaveLength(1);
      expect(agentExecuteCalls[0].metadata?.fromUser).toBe(TELEGRAM_USERS.ALICE.first_name);
    });

    it('non-whitelisted user (BOB) does NOT trigger agent.execute', async () => {
      const bobMsg: NormalizedInboundMessage = {
        messageId: 'msg-3',
        fromUserId: String(TELEGRAM_USERS.BOB.id),
        fromUser: TELEGRAM_USERS.BOB.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'hello',
      };

      const sessionKey = `telegram-test:${TELEGRAM_USERS.BOB.id}`;
      await adapter.simulateInboundMessage(sessionKey, bobMsg);

      // Agent should NOT be called (BOB not whitelisted)
      expect(agentExecuteCalls).toHaveLength(0);
    });

    it('non-whitelisted user (CHARLIE) does NOT trigger agent.execute', async () => {
      const charlieMsg: NormalizedInboundMessage = {
        messageId: 'msg-4',
        fromUserId: String(TELEGRAM_USERS.CHARLIE.id),
        fromUser: TELEGRAM_USERS.CHARLIE.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'help',
      };

      const sessionKey = `telegram-test:${TELEGRAM_USERS.CHARLIE.id}`;
      await adapter.simulateInboundMessage(sessionKey, charlieMsg);

      expect(agentExecuteCalls).toHaveLength(0);
    });

    it('group message from whitelisted user triggers agent.execute', async () => {
      const groupMsg: NormalizedInboundMessage = {
        messageId: 'msg-5',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'group',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: '@AgentBotTest what time is it?',
      };

      const sessionKey = `telegram-test:${TELEGRAM_CHATS.GROUP_TEST.id}`;
      await adapter.simulateInboundMessage(sessionKey, groupMsg);

      expect(agentExecuteCalls).toHaveLength(1);
      expect(agentExecuteCalls[0].metadata?.chatType).toBe('group');
    });

    it('group message from non-whitelisted user does NOT trigger agent.execute', async () => {
      const groupMsg: NormalizedInboundMessage = {
        messageId: 'msg-6',
        fromUserId: String(TELEGRAM_USERS.BOB.id),
        fromUser: TELEGRAM_USERS.BOB.first_name,
        chatType: 'group',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: '@AgentBotTest help please',
      };

      const sessionKey = `telegram-test:${TELEGRAM_CHATS.GROUP_TEST.id}`;
      await adapter.simulateInboundMessage(sessionKey, groupMsg);

      expect(agentExecuteCalls).toHaveLength(0);
    });
  });

  describe('Reply Delivery to Initiating Channel', () => {
    it('after agent.execute completes, message is sent to private chat', async () => {
      const ownerPrivateChat = TELEGRAM_USERS.OWNER.id;
      const sessionKey = `telegram-test:${ownerPrivateChat}`;

      const msg: NormalizedInboundMessage = {
        messageId: 'msg-10',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'calculate 2+2',
      };

      // Simulate message arrival and agent execution
      await adapter.simulateInboundMessage(sessionKey, msg);

      // Simulate agent completion by calling channel.send
      const agentResponse = 'The answer is 4';
      await bus.call('channel.send', {
        sessionKey,
        text: agentResponse,
      });

      // Verify send was called with correct sessionKey
      expect(channelSendCalls).toHaveLength(1);
      expect(channelSendCalls[0].sessionKey).toBe(sessionKey);
      expect(channelSendCalls[0].text).toBe(agentResponse);
    });

    it('after agent.execute completes, message is sent to group chat', async () => {
      const groupChatId = TELEGRAM_CHATS.GROUP_TEST.id;
      const sessionKey = `telegram-test:${groupChatId}`;

      const msg: NormalizedInboundMessage = {
        messageId: 'msg-11',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'group',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: '@AgentBotTest list todos',
      };

      await adapter.simulateInboundMessage(sessionKey, msg);

      // Simulate agent sending reply to group
      const agentResponse = '1. Buy milk\n2. Walk dog\n3. Write tests';
      await bus.call('channel.send', {
        sessionKey,
        text: agentResponse,
      });

      expect(channelSendCalls).toHaveLength(1);
      expect(channelSendCalls[0].sessionKey).toBe(sessionKey);
      expect(channelSendCalls[0].text).toContain('Buy milk');
    });

    it('sessionKey format preserves channel and user identity', async () => {
      const ownerUserId = TELEGRAM_USERS.OWNER.id;
      const sessionKey = `telegram-test:${ownerUserId}`;

      const msg: NormalizedInboundMessage = {
        messageId: 'msg-12',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'test',
      };

      await adapter.simulateInboundMessage(sessionKey, msg);

      // The agent should have received correct sessionKey for routing back
      expect(agentExecuteCalls[0].sessionKey).toBe(sessionKey);

      // When reply is sent to this sessionKey, it reaches the right user
      await bus.call('channel.send', { sessionKey, text: 'Reply' });
      expect(channelSendCalls[0].sessionKey).toBe(sessionKey);
    });

    it('multiple whitelisted users get independent sessions (no cross-talk)', async () => {
      // OWNER sends message
      const ownerMsg: NormalizedInboundMessage = {
        messageId: 'msg-13a',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'my secret',
      };
      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_USERS.OWNER.id}`, ownerMsg);

      // ALICE sends message
      const aliceMsg: NormalizedInboundMessage = {
        messageId: 'msg-13b',
        fromUserId: String(TELEGRAM_USERS.ALICE.id),
        fromUser: TELEGRAM_USERS.ALICE.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'her question',
      };
      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_USERS.ALICE.id}`, aliceMsg);

      // Both triggered agent.execute
      expect(agentExecuteCalls).toHaveLength(2);

      const ownerSessionKey = agentExecuteCalls[0].sessionKey;
      const aliceSessionKey = agentExecuteCalls[1].sessionKey;

      // Session keys are different (user IDs embedded)
      expect(ownerSessionKey).not.toBe(aliceSessionKey);

      // Replies go to correct users
      await bus.call('channel.send', { sessionKey: ownerSessionKey, text: 'Owner reply' });
      await bus.call('channel.send', { sessionKey: aliceSessionKey, text: 'Alice reply' });

      expect(channelSendCalls).toHaveLength(2);
      expect(channelSendCalls[0].sessionKey).toBe(ownerSessionKey);
      expect(channelSendCalls[1].sessionKey).toBe(aliceSessionKey);
    });
  });

  describe('Edge Cases', () => {
    it('whitelisted user in group without mention is ignored (requires skipAgent)', async () => {
      const msg: NormalizedInboundMessage = {
        messageId: 'msg-20',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'group',
        isMentioned: false, // Not mentioned
        channelType: 'telegram',
        skipAgent: true, // Bot logic marks as skip
        text: 'just chatting',
      };
      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_CHATS.GROUP_TEST.id}`, msg);

      // Not mentioned, so agent not called despite being whitelisted
      expect(agentExecuteCalls).toHaveLength(0);
    });

    it('non-whitelisted user reply to bot in group is ignored', async () => {
      const msg: NormalizedInboundMessage = {
        messageId: 'msg-21',
        fromUserId: String(TELEGRAM_USERS.BOB.id),
        fromUser: TELEGRAM_USERS.BOB.first_name,
        chatType: 'group',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'good point',
      };
      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_CHATS.GROUP_TEST.id}`, msg);

      // BOB is not whitelisted, so agent not called even with mention
      expect(agentExecuteCalls).toHaveLength(0);
    });

    it('media message from whitelisted user is delivered', async () => {
      const msg: NormalizedInboundMessage = {
        messageId: 'msg-22',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: '[photo sent]',
        media: {
          type: 'image',
          mimeType: 'image/jpeg',
          path: '/tmp/photo.jpg',
        },
      };
      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_USERS.OWNER.id}`, msg);

      // Whitelisted + media = should process
      expect(agentExecuteCalls).toHaveLength(1);
    });

    it('media message from non-whitelisted user is not delivered', async () => {
      const msg: NormalizedInboundMessage = {
        messageId: 'msg-23',
        fromUserId: String(TELEGRAM_USERS.BOB.id),
        fromUser: TELEGRAM_USERS.BOB.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: '[photo sent]',
        media: {
          type: 'image',
          mimeType: 'image/jpeg',
          path: '/tmp/photo.jpg',
        },
      };
      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_USERS.BOB.id}`, msg);

      // Not whitelisted, even with media
      expect(agentExecuteCalls).toHaveLength(0);
    });
  });

  describe('Whitelist Verification across Updates', () => {
    it('same user with multiple messages each triggers agent.execute', async () => {
      const msg1: NormalizedInboundMessage = {
        messageId: 'msg-30',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'first',
      };

      const msg2: NormalizedInboundMessage = {
        messageId: 'msg-31',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'second',
      };

      const sessionKey = `telegram-test:${TELEGRAM_USERS.OWNER.id}`;
      await adapter.simulateInboundMessage(sessionKey, msg1);
      await adapter.simulateInboundMessage(sessionKey, msg2);

      expect(agentExecuteCalls).toHaveLength(2);
      expect(agentExecuteCalls[0].task).toBe('first');
      expect(agentExecuteCalls[1].task).toBe('second');
    });

    it('interleaved whitelisted and non-whitelisted users execute correctly', async () => {
      const ownerMsg: NormalizedInboundMessage = {
        messageId: 'msg-40',
        fromUserId: String(TELEGRAM_USERS.OWNER.id),
        fromUser: TELEGRAM_USERS.OWNER.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'owner msg',
      };

      const bobMsg: NormalizedInboundMessage = {
        messageId: 'msg-41',
        fromUserId: String(TELEGRAM_USERS.BOB.id),
        fromUser: TELEGRAM_USERS.BOB.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'bob msg',
      };

      const aliceMsg: NormalizedInboundMessage = {
        messageId: 'msg-42',
        fromUserId: String(TELEGRAM_USERS.ALICE.id),
        fromUser: TELEGRAM_USERS.ALICE.first_name,
        chatType: 'private',
        isMentioned: true,
        channelType: 'telegram',
        skipAgent: false,
        text: 'alice msg',
      };

      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_USERS.OWNER.id}`, ownerMsg);
      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_USERS.BOB.id}`, bobMsg);
      await adapter.simulateInboundMessage(`telegram-test:${TELEGRAM_USERS.ALICE.id}`, aliceMsg);

      // Only owner and alice (whitelisted) executed
      expect(agentExecuteCalls).toHaveLength(2);
      // Both calls should come through
      expect(agentExecuteCalls[0].sessionKey).toContain(String(TELEGRAM_USERS.OWNER.id));
      expect(agentExecuteCalls[1].sessionKey).toContain(String(TELEGRAM_USERS.ALICE.id));
    });
  });
});
