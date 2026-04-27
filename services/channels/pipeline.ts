/**
 * Inbound message pipeline — core policy orchestrator for normalized messages.
 * Handles: link expansion, whitelist enforcement, agent execution flow.
 */

import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import type { NormalizedInboundMessage } from './contracts.js';
import type { ChannelAdapter } from './contracts.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { parseChannelTarget } from '../../lib/subagent.js';
import { expandLinks } from './link-expand.js';
import { StatusReactionController } from './status-reactions.js';

const log = createLogger('channels-pipeline');

export interface PipelineSession {
  adapter: ChannelAdapter;
  reactionController?: StatusReactionController;
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

    // Check whitelist if agent would execute
    let shouldSkipAgent = message.skipAgent;
    if (!shouldSkipAgent && channelEntry.allowFrom?.length) {
      const isWhitelisted = this.checkWhitelist(message.fromUserId, channelEntry.allowFrom);
      if (!isWhitelisted) {
        log.debug(`user ${message.fromUserId} not whitelisted - skipping agent`);
        shouldSkipAgent = true;
      }
    }

    // If agent is skipped, just append to history
    if (shouldSkipAgent) {
      log.info(`inbound (skipAgent): ${sessionKey} "${enrichedContent.slice(0, 80)}"`);
      this.bus.call('agent.appendMessage', {
        sessionKey,
        task: enrichedContent,
        metadata: { cwd: channelEntry.cwd },
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

    activeSessions.set(sessionKey, { adapter, reactionController });

    log.info(`inbound: ${sessionKey} "${enrichedContent.slice(0, 80)}"`);

    // Build metadata for agent
    const metadata: EventMap['agent.execute']['params']['metadata'] = {
      ...(message.messageId && { messageId: message.messageId }),
      ...(message.fromUser && { fromUser: message.fromUser }),
      ...(message.chatType && { chatType: message.chatType }),
      ...(message.isMentioned !== undefined && { isMentioned: message.isMentioned }),
      ...(message.channelType && { channelType: message.channelType }),
      ...(channelEntry.cwd && { cwd: channelEntry.cwd }),
      ...(channelEntry.model && { model: channelEntry.model }),
      ...(channelEntry.instructionsFile && { instructionsFile: channelEntry.instructionsFile }),
    };

    // Execute agent
    this.bus.call('agent.execute', {
      sessionKey,
      task: enrichedContent,
      ...(Object.keys(metadata).length > 0 && { metadata }),
    }).catch(err => {
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

  /**
   * Check if a user is on the whitelist.
   * Normalizes both whitelist entries and the user ID for comparison.
   */
  private checkWhitelist(fromUserId: string, allowFrom: string[]): boolean {
    // Normalize whitelist entries: remove + prefix
    const normalizedAllowList = new Set(allowFrom.map(p => p.replace(/^\+/, '')));

    // Normalize user ID: remove + prefix and JID suffix
    const normalizedFromUser = fromUserId.replace(/^\+/, '').replace(/@[^@]+$/, '');

    // Check: full JID match OR normalized numeric match
    const isFullJidWhitelisted = normalizedAllowList.has(fromUserId.replace(/^\+/, ''));
    const isNormalizedWhitelisted = normalizedAllowList.has(normalizedFromUser);

    return isFullJidWhitelisted || isNormalizedWhitelisted;
  }
}
