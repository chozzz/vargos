/**
 * Inbound message pipeline — core policy orchestrator for normalized messages.
 * Handles: link expansion, whitelist enforcement, agent execution flow.
 */

import type { Bus } from '../../gateway/bus.js';
import type { AppConfig } from '../../services/config/index.js';
import type { NormalizedInboundMessage, ChannelAdapter } from './types.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { parseChannelTarget } from '../../lib/session-key.js';
import { expandLinks } from './link-expand.js';
import { StatusReactionController } from './status-reactions.js';

const log = createLogger('channels-pipeline');

export interface PipelineSession {
  adapter: ChannelAdapter;
  reactionController?: StatusReactionController;
  replied: boolean; // true if agent called channel.send
}

export class InboundMessagePipeline {
  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {}

  /**
   * Process a normalized inbound message through the policy pipeline.
   * Handles: link expansion, whitelist checking, agent execution, typing indicators.
   */
  async process(
    sessionKey: string,
    message: NormalizedInboundMessage,
    adapter: ChannelAdapter,
    activeSessions: Map<string, PipelineSession>,
  ): Promise<void> {
    const target = parseChannelTarget(sessionKey);
    if (!target) {
      log.debug(`invalid session key: ${sessionKey}`);
      return;
    }

    const channelEntry = this.config.channels.find(c => c.id === target.channel);
    if (!channelEntry) {
      log.debug(`no channel entry for: ${target.channel}`);
      return;
    }

    // Expand links in text content
    let enrichedContent = message.text || '';
    if (enrichedContent) {
      enrichedContent = await expandLinks(enrichedContent, this.config.linkExpand).catch(() => enrichedContent);
    }

    // Extract execution-relevant fields from channel config
    const cwd = channelEntry.cwd;
    const model = channelEntry.model;

    // Delegate execution decision to adapter (handles whitelist + mention logic)
    const shouldExecute = adapter.shouldExecute(message.fromUserId, message.chatType, message.isMentioned);

    if (!shouldExecute) {
      const reason = message.chatType === 'private' ? 'not whitelisted' : (message.isMentioned ? 'not whitelisted' : 'not mentioned');
      log.debug(`shouldExecute=false: userId=${message.fromUserId} chatType=${message.chatType} isMentioned=${message.isMentioned}`);
      log.info(`← ${sessionKey} (skip: ${reason}) "${enrichedContent.slice(0, 80)}"`);
      this.bus.call('agent.appendMessage', {
        sessionKey,
        content: enrichedContent,
      }).catch(err => log.error(`failed to append message: ${toMessage(err)}`));
      return;
    }

    // Start typing and setup reaction controller
    adapter.startTyping(sessionKey, true);

    const messageId = adapter.extractLatestMessageId(target.userId);
    let reactionController: StatusReactionController | undefined;
    if (adapter.react && messageId) {
      reactionController = new StatusReactionController(
        { react: adapter.react.bind(adapter) },
        sessionKey,
        messageId,
      );
      reactionController.setThinking();
    }

    activeSessions.set(sessionKey, { adapter, reactionController, replied: false });

    log.info(`← ${sessionKey} "${enrichedContent.slice(0, 80)}"`);

    // Set timeout for hung agents (2 minutes)
    const AGENT_TIMEOUT_MS = 120_000;
    const timeoutId = setTimeout(() => {
      const session = activeSessions.get(sessionKey);
      if (!session) return;

      log.warn(`agent timeout: ${sessionKey} (${AGENT_TIMEOUT_MS / 1000}s) — cleaning up`);
      if (session.reactionController) {
        session.reactionController.setError();
        session.reactionController.dispose();
      }
      session.adapter.stopTyping(sessionKey);
      activeSessions.delete(sessionKey);
    }, AGENT_TIMEOUT_MS);

    // Execute agent
    this.bus.call('agent.execute', {
      sessionKey,
      task: enrichedContent,
      ...(cwd && { cwd }),
      ...(model && { model }),
    }).catch(err => {
      clearTimeout(timeoutId);
      const session = activeSessions.get(sessionKey);
      if (!session) return;

      const errorMsg = toMessage(err);
      log.error(`agent execution failed: ${errorMsg}`);

      activeSessions.delete(sessionKey);
      session.adapter.stopTyping(sessionKey);

      this.bus.call('channel.send', { sessionKey, text: `System error: ${errorMsg}` })
        .catch(sendErr => log.error(`failed to send error message: ${toMessage(sendErr)}`));

      if (session.reactionController) {
        session.reactionController.setError();
        session.reactionController.dispose();
      }
    });
  }

}
